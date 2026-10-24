import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { parseCache } from "../../src/cache/format.js";
import { generate } from "../../src/cache/job.js";
import { engineVersion } from "../../src/cache/mapper.js";
import {
	errors,
	instantiations,
	queries,
	SCHEMA,
	type TempProject,
	tempProject,
	tsconfig,
} from "./project.js";

let p: TempProject;
const isCorePath = (path: string): boolean =>
	path.startsWith(join(p.corePackage, "dist"));

beforeAll(() => {
	p = tempProject({
		"tsconfig.json": tsconfig(),
		"tsconfig.ci.json": JSON.stringify({
			extends: "./tsconfig.json",
			contentMappers: null,
		}),
		"tsconfig.off.json": tsconfig({ contentMappers: undefined }),
		"src/db.ts": SCHEMA,
		"src/queries.ts":
			queries(40) +
			`export const bad = sql("SELECT nmae FROM users");\nexport const wrongArgument = sql("SELECT id FROM users WHERE id = $1", "one");\n`,
		"src/generated/queries.typesqlcache": "{}\n",
		"tests/tsconfig.json": JSON.stringify({
			extends: "../tsconfig.json",
			include: ["../src", "."],
		}),
		"tests/more.ts": queries(5, 100, "../src/db.js"),
	});
});
afterAll(() => p.remove());

const check = (
	config: string,
	extra: string[] = [],
	env: NodeJS.ProcessEnv = {},
) =>
	p.tsc(
		["-p", config, "--extendedDiagnostics", "--checkers", "1", ...extra],
		env,
	);

describe("tsc and the content mapper", () => {
	test("without the entry, with null, and extending null: no TS18068, no mapper, the cache file is not in the program", () => {
		const log = join(p.dir, "mapper.log");
		for (const config of ["tsconfig.off.json", "tsconfig.ci.json"]) {
			const r = p.tsc(["-p", config, "--listFiles"], {
				TYPESQL_CACHE_LOG: log,
			});
			expect(r.out).not.toContain("TS18068");
			expect(r.out).not.toContain(".typesqlcache");
			expect(errors(r.out)).toHaveLength(2);
		}
		expect(existsSync(log)).toBe(false);
	});

	test("with the entry, --runExternalCode is required (TS18068)", () => {
		expect(p.tsc(["-p", "tsconfig.json"]).out).toContain("TS18068");
	});

	test("an empty cache file: same diagnostics as without the mapper", () => {
		const cold = check("tsconfig.ci.json");
		const warm = check("tsconfig.json", ["--runExternalCode"]);
		expect(errors(warm.out)).toEqual(errors(cold.out));
		expect(errors(cold.out)).toHaveLength(2);
	});

	test("a generated cache: the same diagnostics, far fewer instantiations", async () => {
		const r = await generate({
			configFile: join(p.dir, "tsconfig.json"),
			cacheFile: join(p.dir, "src/generated/queries.typesqlcache"),
			engine: engineVersion(),
			isCorePath,
		});
		expect(r.dropped).toBe(0);
		expect(r.computed).toBeGreaterThan(40);
		const cold = check("tsconfig.ci.json");
		const warm = check("tsconfig.json", ["--runExternalCode"]);
		expect(errors(warm.out)).toEqual(errors(cold.out));
		// the SQL error and the wrong argument (TS2345 from the cached parameter types)
		expect(errors(warm.out).map((l) => /error (TS\d+)/.exec(l)![1])).toEqual([
			"TS2345",
			"TS2345",
		]);
		expect(instantiations(warm.out)).toBeLessThan(instantiations(cold.out) / 5);
	}, 120_000);

	test("a job that tsc cuts short leaves the file as it was, or complete", () => {
		const before = p.read("src/generated/queries.typesqlcache");
		p.write("src/generated/queries.typesqlcache", "{}\n");
		check("tsconfig.json", ["--runExternalCode"], { TYPESQL_CACHE_DELAY: "0" });
		const after = p.read("src/generated/queries.typesqlcache");
		expect(after === "{}\n" || parseCache(after) !== null).toBe(true);
		p.write("src/generated/queries.typesqlcache", before);
	}, 120_000);

	test("two cache files in one program do not conflict, and both serve entries", () => {
		p.write(
			"src/other/more.typesqlcache",
			p.read("src/generated/queries.typesqlcache"),
		);
		const warm = check("tsconfig.json", ["--runExternalCode"]);
		expect(errors(warm.out)).toHaveLength(2);
		expect(warm.out).not.toContain("TS2717");
		p.write("src/generated/queries.typesqlcache", "{}\n");
		const one = check("tsconfig.json", ["--runExternalCode"]);
		const cold = check("tsconfig.ci.json");
		expect(instantiations(one.out)).toBeLessThan(instantiations(cold.out) / 5);
	});

	test("a bare .typesqlcache dotfile is not included: no mapper, no errors", () => {
		const q = p.tsc([
			"-p",
			"tsconfig.json",
			"--runExternalCode",
			"--listFiles",
		]);
		p.write("src/.typesqlcache", "{}\n");
		const r = p.tsc([
			"-p",
			"tsconfig.json",
			"--runExternalCode",
			"--listFiles",
		]);
		expect(r.out).not.toContain("src/.typesqlcache");
		expect(errors(r.out)).toEqual(errors(q.out));
	});
});

describe("sharing and scale", () => {
	test("one file shared by two projects keeps both projects' entries", async () => {
		const cacheFile = join(p.dir, "src/generated/queries.typesqlcache");
		p.write("src/generated/queries.typesqlcache", "{}\n");
		p.write("src/other/more.typesqlcache", "{}\n");
		const run = (config: string) =>
			generate({
				configFile: join(p.dir, config),
				cacheFile,
				engine: engineVersion(),
				isCorePath,
			});
		await run("tsconfig.json");
		await run("tests/tsconfig.json");
		const keys = (): string[] =>
			Object.values(
				parseCache(readFileSync(cacheFile, "utf8"))!.groups,
			).flatMap((g) => Object.keys(g.entries));
		expect(keys().some((k) => k.includes("id > 100"))).toBe(true);
		expect(keys().some((k) => k.includes("id > 0 "))).toBe(true);
		// a pass of the main project alone does not drop the test project's entries
		await run("tsconfig.json");
		expect(keys().some((k) => k.includes("id > 100"))).toBe(true);
		const owners = Object.values(
			parseCache(readFileSync(cacheFile, "utf8"))!.owners,
		);
		expect(owners.some((o) => o.includes("../../tests/tsconfig.json"))).toBe(
			true,
		);
	}, 120_000);

	test("a miss costs about the same with one cache file or fifty", () => {
		p.write("src/generated/queries.typesqlcache", "{}\n");
		p.write("src/other/more.typesqlcache", "{}\n");
		const one = instantiations(
			check("tsconfig.json", ["--runExternalCode"]).out,
		);
		// fifty files whose entries are other statements
		const other = generateOther();
		for (let i = 0; i < 50; i++) p.write(`src/many/c${i}.typesqlcache`, other);
		const fifty = instantiations(
			check("tsconfig.json", ["--runExternalCode"]).out,
		);
		expect(Math.abs(fifty - one) / one).toBeLessThan(0.02);
	}, 120_000);
});

/** A cache file whose keys the project does not use: every lookup in it misses. */
function generateOther(): string {
	return JSON.stringify({
		typesqlcache: 1,
		engine: engineVersion(),
		groups: {
			g: {
				t: "{}",
				h: "never",
				w: {},
				q: {},
				entries: { "SELECT 'not used'": { r: ["select", "*"], a: "{}" } },
			},
		},
		maps: {},
		ddl: {},
		owners: {},
	});
}

test("the runtime entry point does not load the cache code", () => {
	const dist = join(p.corePackage, "dist");
	const seen = new Set<string>();
	const visit = (file: string): void => {
		if (seen.has(file)) return;
		seen.add(file);
		const text = readFileSync(file, "utf8");
		for (const m of text.matchAll(
			/(?:import|export)[^"']*?from\s*["'](\.[^"']+)["']|import\(["'](\.[^"']+)["']\)/g,
		)) {
			const spec = m[1] ?? m[2]!;
			visit(join(file, "..", spec));
		}
	};
	visit(join(dist, "index.js"));
	expect(
		[...seen].filter((f) => f.includes(`${join("dist", "cache")}`)),
	).toEqual([]);
	expect(seen.size).toBeGreaterThan(5);
});
