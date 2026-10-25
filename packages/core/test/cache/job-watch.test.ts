/**
 * The long-lived job (job.ts `Job`): its passes as the watcher sees source files change, the
 * debounce, the idle close of the TypeScript session, and stop().
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { Job, type JobOptions } from "../../src/cache/job.js";
import { engineVersion } from "../../src/cache/mapper.js";
import { type TempProject, tempProject, tsconfig } from "./project.js";

// The project lives in app/ and reads its schema from shared/, which the job does not watch.
// The cache file is a .json here, so that the job's own writes would pass the source filter.
const schema = (email: string) =>
	`import { createSql, type Col, type Generated, type Nullable } from "@typesql/core";
export interface DB { users: { id: Generated<"int4">; email: ${email}<"text">; name: Nullable<"text"> } }
export const sql = createSql<DB>();
`;
const Q = `import { sql } from "../../shared/schema.js";\nexport const q = sql("SELECT email FROM users WHERE id = $1", 1);\n`;
const R = Q.replace("email", "name");
const S = Q.replace("email", "id");

// fs.watch as it is, with the listeners kept, to send events by hand
const listeners = vi.hoisted(
	() => [] as ((event: string, name: string | Buffer | null) => void)[],
);
vi.mock("node:fs", async (original) => {
	const fs = await original<typeof import("node:fs")>();
	const watch = (
		path: string,
		options: object,
		listener: (event: string, name: string | Buffer | null) => void,
	) => {
		listeners.push(listener);
		return fs.watch(path, options, listener);
	};
	return { ...fs, watch };
});

let p: TempProject;
beforeAll(() => {
	p = tempProject({
		"app/tsconfig.json": tsconfig({ include: ["src", "../shared"] }),
		"app/src/q.ts": Q,
		"app/src/r.ts": R,
		"app/src/s.mts": S,
		"app/src/generated/queries.json": "{}\n",
		"shared/schema.ts": schema("Col"),
	});
});
afterAll(() => p.remove());

const options = (): JobOptions => ({
	configFile: join(p.dir, "app/tsconfig.json"),
	cacheFile: join(p.dir, "app/src/generated/queries.json"),
	engine: engineVersion(),
	isCorePath: (f) => f.startsWith(join(p.corePackage, "dist")),
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (what: string, f: () => boolean, ms = 20_000) => {
	const end = Date.now() + ms;
	while (!f()) {
		if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
		await sleep(20);
	}
};
const recorder = () => {
	const logs: string[] = [];
	return {
		logs,
		log: (m: string) => void logs.push(m),
		passes: () => logs.filter((l) => l.startsWith("pass: ")),
	};
};

test("a pass at start and one per burst of source changes; files it writes or does not read start none; nothing after stop", async () => {
	const r = recorder();
	const job = new Job({ ...options(), log: r.log, debounceMs: 200 });
	job.start();
	await until("the first pass", () => r.passes().length === 1);
	expect(r.passes()[0]).toMatch(
		/^pass: 3 statements, 6 computed, 0 kept, 0 dropped, written, \d+ ms$/,
	);
	// the pass wrote the cache file (and its lock and temporary file next to it): no pass for that
	await sleep(800);
	for (const f of [
		"node_modules/x/index.ts",
		".git/x.json",
		"README.md",
		"src/q.ts.orig.json.bak",
		"src/generated/queries.json.x.json",
		"src/generated/__typesql_probe__.ts",
	])
		p.write(`app/${f}`, "");
	await sleep(800);
	expect(r.passes()).toHaveLength(1);

	// three files in one burst: one pass, which sees all of them
	p.write(
		"app/src/q.ts",
		`${Q}export const q2 = sql("SELECT name FROM users");\n`,
	);
	p.write(
		"app/src/r.ts",
		`${R}export const r2 = sql("SELECT id, name FROM users");\n`,
	);
	p.write(
		"app/src/s.mts",
		`${S}export const s2 = sql("SELECT id, email FROM users");\n`,
	);
	await until("the pass after the changes", () => r.passes().length === 2);
	await sleep(800);
	expect(r.passes()).toHaveLength(2);
	expect(r.passes()[1]).toMatch(
		/^pass: 6 statements, 6 computed, 6 kept, 0 dropped, written, \d+ ms$/,
	);

	await job.stop();
	p.write("app/src/q.ts", Q);
	await sleep(800);
	expect(r.passes()).toHaveLength(2);
	expect(r.logs).toEqual(r.passes());
	p.write("app/src/r.ts", R);
	p.write("app/src/s.mts", S);
}, 120_000);

test("a change waits for debounceMs; stop() drops the pending pass and clears the timers", async () => {
	const r = recorder();
	// the job's timers of 60 s (the debounce and the idle close), and the timers cleared
	const made: unknown[] = [];
	const cleared = new Set<unknown>();
	const set = globalThis.setTimeout;
	const clear = globalThis.clearTimeout;
	vi.spyOn(globalThis, "setTimeout").mockImplementation(((
		f: () => void,
		ms?: number,
	) => {
		const t = set(f, ms);
		if (ms === 60_000) made.push(t);
		return t;
	}) as typeof setTimeout);
	vi.spyOn(globalThis, "clearTimeout").mockImplementation((t) => {
		cleared.add(t);
		clear(t);
	});
	try {
		const job = new Job({
			...options(),
			log: r.log,
			debounceMs: 60_000,
			idleMs: 60_000,
		});
		job.start();
		await until("the first pass", () => r.passes().length === 1);
		p.write("app/src/q.ts", `${Q}// changed\n`);
		await sleep(2000);
		expect(r.passes()).toHaveLength(1);
		expect(made.length).toBeGreaterThanOrEqual(2);
		const pending = made.filter((t) => !cleared.has(t));
		expect(pending).toHaveLength(2);
		await job.stop();
		expect(pending.filter((t) => !cleared.has(t))).toEqual([]);
	} finally {
		vi.restoreAllMocks();
		p.write("app/src/q.ts", Q);
	}
	expect(r.logs).toEqual(r.passes());
}, 120_000);

test("after idleMs without a pass the session closes, and the next pass reads every file again", async () => {
	const r = recorder();
	const job = new Job({
		...options(),
		log: r.log,
		debounceMs: 10,
		idleMs: 150,
	});
	job.start();
	await until("the first pass", () => r.passes().length === 1);
	// a pass that starts before idleMs: the session stays open for it
	p.write(
		"app/src/q.ts",
		`${Q}export const t = sql("SELECT id, name FROM users");\n`,
	);
	await until("the second pass", () => r.passes().length === 2);
	expect(r.passes()[1]).toMatch(
		/^pass: 4 statements, 2 computed, 6 kept, 0 dropped, written, /,
	);
	// shared/ is not watched: only a new session sees this change
	await sleep(600);
	p.write("shared/schema.ts", schema("Nullable"));
	p.write(
		"app/src/q.ts",
		`${Q}export const t = sql("SELECT id, name FROM users");\n// touched\n`,
	);
	await until("the third pass", () => r.passes().length === 3);
	expect(r.passes()[2]).toMatch(
		/^pass: 4 statements, 8 computed, 0 kept, 0 dropped, written, /,
	);
	await job.stop();
	expect(r.logs).toEqual(r.passes());
	p.write("app/src/q.ts", Q);
}, 120_000);

test("without idleMs the session stays open between passes (five minutes)", async () => {
	const r = recorder();
	const job = new Job({ ...options(), log: r.log, debounceMs: 10 });
	job.start();
	await until("the first pass", () => r.passes().length === 1);
	await sleep(300);
	p.write("shared/schema.ts", schema("Col"));
	p.write("app/src/q.ts", `${Q}// touched\n`);
	await until("the second pass", () => r.passes().length === 2);
	// the open session has not seen shared/ change
	expect(r.passes()[1]).toMatch(
		/^pass: 3 statements, 0 computed, 6 kept, 0 dropped, unchanged, /,
	);
	await job.stop();
}, 120_000);

test("stop() during a pass abandons it: nothing is written or logged", async () => {
	const cacheFile = join(p.dir, "app/src/generated/stopped.json");
	p.write("app/src/generated/stopped.json", "{}\n");
	const r = recorder();
	const job = new Job({ ...options(), cacheFile, log: r.log });
	job.start();
	await sleep(50);
	await job.stop();
	await sleep(2000);
	expect(r.logs).toEqual([]);
	expect(readFileSync(cacheFile, "utf8")).toBe("{}\n");
}, 120_000);

test("a directory that cannot be watched and passes that fail are logged, or quiet without a log", async () => {
	const bad = {
		...options(),
		// a path recursive fs.watch refuses (on Linux it watches a missing directory without complaint)
		configFile: join(p.dir, "a\0b/tsconfig.json"),
		cacheFile: join(p.dir, "a\0b/queries.json"),
	};
	const r = recorder();
	const job = new Job({ ...bad, log: r.log });
	const quiet = new Job(bad);
	job.start();
	quiet.start();
	expect(r.logs).toHaveLength(1);
	expect(r.logs[0]).toMatch(
		/^watch failed \(The argument 'path' must be a string, Uint8Array, or URL without null bytes\. Received .*\); the cache updates when the project is reopened$/,
	);
	await until("the failed pass", () => r.logs.length === 2);
	expect(r.logs[1]).toMatch(/^pass failed: \w*Error[^\n]*\n\s+at /);
	await sleep(1000);
	await job.stop();
	await quiet.stop();
}, 120_000);

test("an event without a file name is ignored", async () => {
	const r = recorder();
	const job = new Job({ ...options(), log: r.log, debounceMs: 10 });
	listeners.length = 0;
	job.start();
	await until("the first pass", () => r.passes().length === 1);
	const listener = listeners.at(-1)!;
	listener("rename", null);
	await sleep(300);
	expect(r.passes()).toHaveLength(1);
	listener("change", join("src", "q.ts"));
	await until("the pass for the named file", () => r.passes().length === 2);
	await job.stop();
}, 120_000);
