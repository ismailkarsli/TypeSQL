#!/usr/bin/env node
import { type ChildProcess, execFileSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type {
	API,
	ConfiguredProjectId,
	Diagnostic,
	Program,
	Snapshot,
} from "typescript/async";
import { findMutants, MUTATORS } from "./type-mutate/sites.ts";
import {
	anchorLines,
	assignIds,
	equivalence,
	equivalenceMarkers,
	fallbackOrder,
	inShard,
	lineStarts,
	type MutantProfile,
	type MutantResult,
	markdownSummary,
	matchesFile,
	mergeReports,
	parseDiff,
	parseShard,
	parseSites,
	position,
	type Report,
	readKillMap,
	type Status,
	type Summary,
	summarize,
	summarizeProfile,
	TestOrder,
	updateKillMap,
} from "./type-mutate/support.ts";

interface CheckResult {
	status: Status;
	checks: number;
	killedBy?: string;
	// why an invalid mutant does not compile
	diagnostic?: string;
	profile?: CheckProfile;
}

type CheckProfile = Omit<MutantProfile, "id" | "status">;

// a mutant as it is selected; the check fills in the rest
type Mutant = Omit<MutantResult, "status" | "killedBy"> & {
	endLine: number;
	endColumn: number;
	lines: number[];
	start: number;
	end: number;
	equivalent: string | undefined;
	ms?: number;
} & Partial<CheckResult>;
type Checked = Mutant & CheckResult;

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MUTATE = [
	"packages/core/src/engine/**/*.ts",
	"packages/core/src/schema/**/*.ts",
	"packages/core/src/type-map/**/*.ts",
];
/**
 * Generated tables, not mutated by default: each entry is copied from Postgres's catalogs (the
 * oracles check them against a live server), so a test per entry would only restate the table.
 */
const DEFAULT_SKIP = ["packages/core/src/engine/typer/pg-functions.ts"];
const DEFAULT_KILL_MAP =
	"node_modules/.cache/typesql-type-mutate/kill-map.json";
const REOPEN_EVERY = 250;

const { values: opts, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		root: { type: "string" },
		project: { type: "string" },
		mutate: { type: "string", multiple: true },
		tests: { type: "string", multiple: true },
		files: { type: "string", multiple: true },
		sites: { type: "string" },
		mutators: { type: "string" },
		changed: { type: "boolean", default: false },
		base: { type: "string" },
		shard: { type: "string" },
		sample: { type: "string" },
		list: { type: "boolean", default: false },
		report: { type: "string" },
		summary: { type: "string" },
		"kill-map": { type: "string" },
		timeout: { type: "string" },
		verbose: { type: "boolean", default: false },
		"check-equivalent": { type: "boolean", default: false },
		compiler: { type: "string", default: "typescript" },
		profile: { type: "boolean", default: false },
	},
});

const ROOT = resolve(opts.root ?? SCRIPT_ROOT);
const rel = (abs: string) => relative(ROOT, abs).split("\\").join("/");
const absPath = (p: string) => resolve(p);
const pathOr = (p: string | undefined, fallback: string) =>
	p ? resolve(p) : join(ROOT, fallback);
const git = (...args: string[]) =>
	execFileSync("git", args, {
		cwd: ROOT,
		encoding: "utf8",
		maxBuffer: 256 << 20,
	});
const tryGit = (...args: string[]) => {
	try {
		return git(...args).trim();
	} catch {
		return undefined;
	}
};
const log = (s: string) => process.stderr.write(`${s}\n`);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

async function merge(files: string[]) {
	const reports = files.map(
		(f) => JSON.parse(readFileSync(absPath(f), "utf8")) as Report,
	);
	const report = mergeReports(reports);
	write(report);
	const killMapPath = pathOr(opts["kill-map"], DEFAULT_KILL_MAP);
	const old = existsSync(killMapPath)
		? readKillMap(readFileSync(killMapPath, "utf8"))
		: readKillMap("");
	const map = updateKillMap(old, report.mutants, {
		commit: report.commit,
		prune: report.complete,
	});
	mkdirSync(dirname(killMapPath), { recursive: true });
	writeFileSync(killMapPath, `${JSON.stringify(map)}\n`);
	log(
		`type-mutate: merged ${reports.length} report(s): ${describe(report.summary)}; kill map ${rel(killMapPath)} (${Object.keys(map.sites).length} entries${report.complete ? ", stale entries dropped" : ""})`,
	);
}

async function run(): Promise<number> {
	const started = Date.now();
	const configFile = pathOr(opts.project, "packages/core/tsconfig.json");
	const projectDir = dirname(configFile);
	const mutatePatterns = opts.mutate ?? DEFAULT_MUTATE;
	const testPatterns = opts.tests ?? [
		rel(projectDir) ? `${rel(projectDir)}/test/**` : "test/**",
	];
	const mutators = opts.mutators
		? opts.mutators.split(",").map((s) => s.trim())
		: MUTATORS;
	for (const m of mutators)
		if (!MUTATORS.includes(m))
			throw new Error(
				`--mutators: unknown mutator ${m} (known: ${MUTATORS.join(", ")})`,
			);
	const shard = opts.shard ? parseShard(opts.shard) : null;
	const sites = opts.sites ? parseSites(opts.sites) : null;

	let base: string | null = null;
	let changed: Map<string, Set<number>> | null = null;
	if (opts.changed) {
		base = resolveBase();
		changed = changedLines(base);
		log(
			`type-mutate: changed lines since ${base.slice(0, 12)} in ${[...changed.keys()].filter((f) => matchesFile(f, mutatePatterns)).length} type-level file(s)`,
		);
	}

	const ts = await loadTypeScript(configFile, opts.compiler!);
	const session = new Session(
		ts,
		configFile,
		opts.timeout ? Number(opts.timeout) * 1000 : 300_000,
	);
	try {
		const program = await session.open();
		const all = (await program.getSourceFileNames()).filter(
			(f) => !f.includes("/node_modules/") && f.startsWith(ROOT + "/"),
		);
		const tests = fallbackOrder(
			all.map(rel).filter((f) => matchesFile(f, testPatterns)),
		);
		const targets = all
			.map(rel)
			.filter(
				(f) =>
					matchesFile(f, mutatePatterns) &&
					(opts.mutate !== undefined || !matchesFile(f, DEFAULT_SKIP)) &&
					!tests.includes(f) &&
					(!opts.files || matchesFile(f, opts.files)) &&
					(!changed || changed.has(f)),
			);
		if (opts.files && !targets.length && !changed)
			throw new Error(
				`--files ${opts.files.join(" ")}: no type-level file of ${rel(configFile)} matches`,
			);

		const files = new Map<string, { text: string; starts: number[] }>();
		const mutants: Mutant[] = [];
		let index = 0;
		for (const file of targets) {
			const sf = (await program.getSourceFile(join(ROOT, file)))!;
			const text = sf.text;
			const starts = lineStarts(text);
			const markers = equivalenceMarkers(text);
			const found = findMutants(sf, ts.SyntaxKind);
			const ids = assignIds(file, found);
			files.set(file, { text, starts });
			found.forEach((m, i) => {
				const lines = anchorLines(starts, m.anchors);
				const n = index++;
				if (!mutators.includes(m.mutator)) return;
				if (sites && !sites(file, lines)) return;
				if (changed && ![...lines].some((l) => changed.get(file)!.has(l)))
					return;
				if (!inShard(n, shard)) return;
				const at = position(starts, m.anchors[0]!.start);
				const end = position(starts, m.anchors[0]!.end);
				mutants.push({
					id: ids[i]!,
					file,
					line: at.line,
					column: at.column,
					endLine: end.line,
					endColumn: end.column,
					lines: [...lines].sort((a, b) => a - b),
					mutator: m.mutator,
					scope: m.scope,
					description: m.description,
					start: m.start,
					end: m.end,
					original: m.original,
					mutated: m.text,
					equivalent: equivalence(markers, lines, m.mutator),
				});
			});
		}
		let selected = mutants;
		if (opts.sample) {
			const n = Number(opts.sample);
			selected =
				n >= mutants.length
					? mutants
					: Array.from(
							{ length: n },
							(_, i) => mutants[Math.floor((i * mutants.length) / n)]!,
						);
		}
		log(
			`type-mutate: ${selected.length} mutant(s) in ${new Set(selected.map((m) => m.file)).size} file(s)${shard ? ` (shard ${shard.index}/${shard.count})` : ""}; ${tests.length} test files`,
		);

		if (opts.list) {
			for (const m of selected)
				console.log(
					`${m.file}:${m.line}:${m.column} ${m.mutator} ${m.id}\n  ${m.description}\n  - ${JSON.stringify(m.original)}\n  + ${JSON.stringify(m.mutated)}${m.equivalent ? `\n  equivalent: ${m.equivalent}` : ""}`,
				);
			return 0;
		}

		// the unmutated project must be clean, or every mutant would be "killed"
		let cleanMs = 0;
		if (selected.length) {
			const t = Date.now();
			const errors = errorsOf(await program.getSemanticDiagnostics(all));
			if (errors.length) {
				for (const d of errors.slice(0, 10))
					log(
						`  ${d.fileName ? rel(d.fileName) : "?"}:${(d.startPosition?.line ?? 0) + 1} TS${d.code}: ${d.text}`,
					);
				throw new Error(
					`type-mutate: ${rel(configFile)} has ${errors.length} type error(s) without mutations; fix them first`,
				);
			}
			cleanMs = Date.now() - t;
			// a mutant may send the checker into a very long instantiation
			if (!opts.timeout) session.timeoutMs = Math.max(60_000, 4 * cleanMs);
			log(
				`type-mutate: project is clean (${secs(cleanMs)}); timeout per mutant ${secs(session.timeoutMs)}`,
			);
		}

		const killMapPath = pathOr(opts["kill-map"], DEFAULT_KILL_MAP);
		const killMap = readKillMap(
			existsSync(killMapPath) ? readFileSync(killMapPath, "utf8") : "",
		);
		const order = new TestOrder(tests, killMap);
		const srcFiles = all.map(rel).filter((f) => !tests.includes(f));

		const profiles: MutantProfile[] = [];
		let done = 0;
		for (const m of selected) {
			// the changed-lines gate trusts equivalence markers; full runs and --check-equivalent still check them
			if (m.equivalent && opts.changed && !opts["check-equivalent"]) {
				Object.assign(m, { status: "equivalent", checks: 0, ms: 0 });
				done++;
				continue;
			}
			const { text } = files.get(m.file)!;
			const mutatedText =
				text.slice(0, m.start) + m.mutated + text.slice(m.end);
			const t = Date.now();
			const result = await session.check(
				m.file,
				mutatedText,
				order.order(m.id, m.file),
				srcFiles.filter((f) => f !== m.file),
			);
			m.ms = Date.now() - t;
			const { profile, ...rest } = result;
			Object.assign(m, rest);
			if (opts.profile && profile)
				profiles.push({ id: m.id, status: rest.status, ...profile });
			if (m.status === "survived" && m.equivalent) m.status = "equivalent";
			if (m.status === "killed") order.recordKill(m.file, m.killedBy!);
			done++;
			// a fresh TypeScript process now and then keeps its memory in check over a long run
			if (done % REOPEN_EVERY === 0 && done < selected.length)
				await session.close().then(() => session.open());
			const line = `[${done}/${selected.length}] ${m.status!.padEnd(10)} ${m.file}:${m.line}:${m.column} ${m.mutator} (${m.killedBy ? `${m.killedBy.replace(/^.*\//, "")}, ` : ""}${m.checks} check(s), ${secs(m.ms)})`;
			if (opts.verbose || m.status === "survived" || m.status === "timeout")
				log(line);
			else if (done % 25 === 0) log(`${line} …`);
		}

		const report = {
			version: 1,
			tool: "type-mutate",
			commit: tryGit("rev-parse", "HEAD") ?? null,
			base,
			compiler: opts.compiler,
			mode: opts.changed
				? "changed"
				: opts.files || opts.sites || opts.mutators || opts.sample
					? "filtered"
					: "full",
			shard,
			project: rel(configFile),
			startedAt: new Date(started).toISOString(),
			durationMs: Date.now() - started,
			files: [...new Set(selected.map((m) => m.file))].sort(),
			tests,
			// every selected mutant has been checked by now
			summary: summarize(selected as Checked[]),
			mutants: (selected as Checked[]).map(
				({ start, end, lines, equivalent, ...m }) => ({
					...m,
					...(m.status === "equivalent"
						? { equivalentReason: equivalent }
						: {}),
				}),
			),
			...(opts.profile
				? { profile: { clean: cleanMs, mutants: profiles } }
				: {}),
		} satisfies Report;
		write(report);
		if (selected.length) {
			mkdirSync(dirname(killMapPath), { recursive: true });
			writeFileSync(
				killMapPath,
				`${JSON.stringify(updateKillMap(killMap, report.mutants, { commit: report.commit }), null, 1)}\n`,
			);
		}

		const survivors = report.mutants.filter((m) => m.status === "survived");
		if (opts.profile) logProfile(profiles);
		log(
			`type-mutate: ${describe(report.summary)} in ${secs(report.durationMs)}`,
		);
		for (const m of survivors)
			log(
				`  survived: ${m.file}:${m.line}:${m.column} ${m.mutator}: ${m.description}\n    - ${JSON.stringify(m.original.length > 300 ? `${m.original.slice(0, 300)}…` : m.original)}\n    + ${JSON.stringify(m.mutated.length > 300 ? `${m.mutated.slice(0, 300)}…` : m.mutated)}`,
			);
		if (opts.changed && survivors.length) {
			log(
				`type-mutate: ${survivors.length} mutant(s) on changed lines survived: add a type test that fails for each, or mark the line \`// type-mutate: equivalent – <reason>\` when no test can tell the difference.`,
			);
			return 1;
		}
		return 0;
	} finally {
		await session.close();
	}
}

function logProfile(profiles: readonly MutantProfile[]) {
	const p = summarizeProfile(profiles);
	const all = p.update + p.own + p.typeTests + p.otherTests + p.sources;
	const share = (ms: number) =>
		`${secs(ms)} (${all ? Math.round((ms / all) * 100) : 0}%)`;
	log(
		`type-mutate: profile of ${p.mutants} mutant(s): snapshot updates ${share(p.update)}, mutated files ${share(p.own)}, type tests (.test-d.ts) ${share(p.typeTests)}, other tests ${share(p.otherTests)}, other sources ${share(p.sources)}`,
	);
	log("  slowest test files (total, checks, average):");
	for (const t of p.byTest.slice(0, 10))
		log(
			`    ${secs(t.ms).padStart(8)} ${String(t.checks).padStart(5)} ${secs(t.ms / t.checks).padStart(7)}  ${t.file}`,
		);
}

function describe(s: Summary) {
	return `${s.total} mutants: ${s.killed} killed, ${s.timeout} timed out, ${s.survived} survived, ${s.equivalent} equivalent, ${s.invalid} invalid; score ${s.score ?? "–"}%`;
}

function write(report: Report) {
	if (opts.report) {
		mkdirSync(dirname(absPath(opts.report)), { recursive: true });
		writeFileSync(absPath(opts.report), `${JSON.stringify(report)}\n`);
	}
	const md = markdownSummary(report);
	if (opts.summary) {
		mkdirSync(dirname(absPath(opts.summary)), { recursive: true });
		writeFileSync(absPath(opts.summary), md);
	}
	if (process.env.GITHUB_STEP_SUMMARY)
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}

function resolveBase() {
	const given = opts.base ?? process.env.BASE;
	if (given && !/^0+$/.test(given)) {
		if (
			tryGit("rev-parse", "--verify", "--quiet", `${given}^{commit}`) ===
			undefined
		)
			throw new Error(
				`type-mutate: base ${given} is not a known commit (fetch with full history: actions/checkout fetch-depth: 0)`,
			);
		return git("merge-base", given, "HEAD").trim();
	}
	for (const ref of ["main", "origin/main"]) {
		const b = tryGit("merge-base", ref, "HEAD");
		if (b) return b;
	}
	throw new Error(
		"type-mutate: no base: set BASE or --base, or have a main branch",
	);
}

function changedLines(base: string) {
	const out = parseDiff(
		git("diff", "--unified=0", "--no-color", "--no-ext-diff", base, "--"),
	);
	for (const f of git("ls-files", "--others", "--exclude-standard")
		.split("\n")
		.filter(Boolean)) {
		const n = readFileSync(join(ROOT, f), "utf8").split("\n").length;
		out.set(f, new Set(Array.from({ length: n }, (_, i) => i + 1)));
	}
	return out;
}

// tsrs (a Rust port of TypeScript 7) ships the same API under other paths
const COMPILERS: Record<string, (part: "async" | "fs" | "ast") => string> = {
	typescript: (part) => `typescript/${part}`,
	tsrs: (part) => `tsrs/unstable/${part}`,
};

async function loadTypeScript(configFile: string, compiler: string) {
	const spec = COMPILERS[compiler];
	if (!spec)
		throw new Error(
			`--compiler: expected ${Object.keys(COMPILERS).join(" or ")}, got ${JSON.stringify(compiler)}`,
		);
	let req = createRequire(configFile);
	try {
		req.resolve(spec("async"));
	} catch {
		req = createRequire(import.meta.url);
	}
	const load = (s: string) => import(pathToFileURL(req.resolve(s)).href);
	const [api, fs, ast] = (await Promise.all([
		load(spec("async")),
		load(spec("fs")),
		load(spec("ast")),
	])) as [
		typeof import("typescript/async"),
		typeof import("typescript/fs"),
		typeof import("typescript/ast"),
	];
	return {
		API: api.API,
		createFileSystemLayer: fs.createFileSystemLayer,
		SyntaxKind: ast.SyntaxKind,
	};
}

type TypeScript = Awaited<ReturnType<typeof loadTypeScript>>;

const errorsOf = (ds: readonly Diagnostic[]) =>
	ds.filter((d) => d.category === 1);

class Session {
	ts: TypeScript;
	configFile: string;
	timeoutMs: number;
	api: API | undefined;
	base: Snapshot | undefined;
	constructor(ts: TypeScript, configFile: string, timeoutMs: number) {
		this.ts = ts;
		this.configFile = configFile;
		this.timeoutMs = timeoutMs;
		this.api = undefined;
		this.base = undefined;
	}

	async open(): Promise<Program<ConfiguredProjectId>> {
		this.api = new this.ts.API({ cwd: dirname(this.configFile) });
		this.base = await this.api.createSnapshot({
			openProjects: [this.configFile],
		});
		return this.program(this.base);
	}

	program(snapshot: Snapshot): Program<ConfiguredProjectId> {
		const project = snapshot.getConfiguredProject(this.configFile);
		if (!project)
			throw new Error(`type-mutate: project ${this.configFile} did not load`);
		return project.program;
	}

	async close() {
		const api = this.api;
		this.api = undefined;
		this.base = undefined;
		await api?.close();
	}

	async restart() {
		try {
			// the client and its process are private in the API's types
			(
				this.api as unknown as
					| { client?: { process?: ChildProcess } }
					| undefined
			)?.client?.process?.kill("SIGKILL");
		} catch {}
		await this.close().catch(() => {});
		await this.open();
	}

	// test files are checked one per call, stopping at the first error: a call for several files is no faster (measured)
	async check(
		file: string,
		text: string,
		tests: string[],
		srcFiles: string[],
	): Promise<CheckResult> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>(
			(_, reject) =>
				(timer = setTimeout(
					() => reject(new Error("timeout")),
					this.timeoutMs,
				)),
		);
		const work = this.checkWorker(file, text, tests, srcFiles);
		try {
			return await Promise.race([work, timeout]);
		} catch (e) {
			if ((e as Error).message !== "timeout") throw e;
			work.catch(() => {});
			await this.restart();
			return { status: "timeout", checks: 0 };
		} finally {
			clearTimeout(timer);
		}
	}

	async checkWorker(
		file: string,
		text: string,
		tests: string[],
		srcFiles: string[],
	): Promise<CheckResult> {
		const abs = join(ROOT, file);
		const since = (t: number) => Math.round(performance.now() - t);
		let t = performance.now();
		const snapshot = await this.base!.update({
			fileSystem: this.ts.createFileSystemLayer([[abs, text]]),
			fileNotifications: { changed: [abs] },
			ensurePrograms: true,
		});
		const profile: CheckProfile = { update: since(t), own: 0, tests: [] };
		const message = (d: Diagnostic) => `TS${d.code}: ${d.text}`.slice(0, 500);
		try {
			const program = this.program(snapshot);
			t = performance.now();
			const own = errorsOf([
				...(await program.getSyntacticDiagnostics(abs)),
				...(await program.getSemanticDiagnostics(abs)),
			]);
			profile.own = since(t);
			if (own.length)
				return {
					status: "invalid",
					diagnostic: message(own[0]!),
					checks: 1,
					profile,
				};
			for (const [i, test] of tests.entries()) {
				t = performance.now();
				const errors = errorsOf(
					await program.getSemanticDiagnostics(join(ROOT, test)),
				);
				profile.tests.push([test, since(t)]);
				if (errors.length)
					return { status: "killed", killedBy: test, checks: i + 2, profile };
			}
			t = performance.now();
			const errors = errorsOf(
				await program.getSemanticDiagnostics(
					srcFiles.map((f) => join(ROOT, f)),
				),
			);
			profile.sources = since(t);
			if (errors.length)
				return {
					status: "invalid",
					diagnostic: `${errors[0]!.fileName ? rel(errors[0]!.fileName) : "?"}: ${message(errors[0]!)}`,
					checks: tests.length + 2,
					profile,
				};
			return { status: "survived", checks: tests.length + 2, profile };
		} finally {
			void snapshot.dispose().catch(() => {});
		}
	}
}

if (positionals[0] === "merge") await merge(positionals.slice(1));
else if (positionals.length)
	throw new Error(`type-mutate: unknown command ${positionals[0]}`);
else process.exitCode = await run();
