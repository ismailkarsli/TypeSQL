#!/usr/bin/env node
// Runs the type-level parser (`ParseProgram<Lex<sql>>`) over every statement of PostgreSQL's
// regression tests in vendor/postgres and compares the outcome with what Postgres did, read
// from the tests' expected output: whether the statement parses and, for a syntax error, the
// token it is at. Disagreements known today are listed in baseline.json; the
// run fails on a new one and on a listed one that went away.
//
//   node run.ts [--update] [test …]
//
// `--update` rewrites baseline.json (only the named tests' entries when tests are named).
// See packages/docs/internals/development.md.
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type BaselineEntry,
	compareBaseline,
	type Entries,
	hashOf,
	type Located,
	preview,
	readBaseline,
	scoped,
	showEntries,
	sortedEntries,
	writeBaseline,
} from "../oracle/baseline.ts";
import { baselineProblems, jobSummary } from "../oracle/job-summary.ts";
import { classify, type Statement } from "./psql.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../..");
const vendor = join(root, "vendor/postgres");
const regress = join(vendor, "src/test/regress");
const engine = join(root, "packages/core/src/engine");
const cache = join(root, "node_modules/.cache/typesql-pg-regress");
const tsc = join(root, "node_modules/.bin/tsc");
const baselinePath = join(here, "baseline.json");

const args = process.argv.slice(2);
const update = args.includes("--update");
const only = args.filter((a) => !a.startsWith("--"));

// ───────────────────────────── the official tests ─────────────────────────────

if (!existsSync(join(regress, "sql"))) {
	fail("vendor/postgres is not checked out. Run `pnpm pg-regress:setup`.");
}
const dirty = git(vendor, "status", "--porcelain");
if (dirty) {
	fail(
		`vendor/postgres has local changes:\n${dirty}\n\nThe official tests are the gold source and must never be modified. Restore them with \`git -C vendor/postgres checkout -- .\` and \`git -C vendor/postgres clean -fd\`.`,
	);
}
const commit = git(vendor, "rev-parse", "HEAD");
const version =
	/^\s*version:\s*'([^']+)'/m.exec(
		readFileSync(join(vendor, "meson.build"), "utf8"),
	)?.[1] ?? "unknown";

const tests = readdirSync(join(regress, "sql"))
	.filter((f) => f.endsWith(".sql"))
	.map((f) => f.slice(0, -4))
	.filter((t) => only.length === 0 || only.includes(t))
	.sort();
const unknownNames = only.filter((t) => !tests.includes(t));
if (unknownNames.length) fail(`no such test: ${unknownNames.join(", ")}`);

// ───────────────────────────── generate and check ─────────────────────────────

/** Result of a statement the parser skips to the next `;` (utility statements without a schema effect). */
const SKIPPED = "<skipped>";
const HEADER = [
	`import type { Lex } from "${relative(cache, join(engine, "lexer/lex.js"))}";`,
	`import type { Toks } from "${relative(cache, join(engine, "lexer/tokens.js"))}";`,
	`import type { ParseProgram } from "${relative(cache, join(engine, "parser/stmt.js"))}";`,
	`import type { SqlError } from "${relative(cache, join(engine, "errors.js"))}";`,
	`/** "ok", "${SKIPPED}" for a statement the parser skips without validating it, or the lexer's or parser's error message. */`,
	`type R<Q extends string> = Lex<Q> extends infer T`,
	`  ? T extends SqlError<infer M, any> ? M`,
	`  : T extends Toks ? (ParseProgram<T> extends infer S ? (S extends SqlError<infer M, any> ? M : S extends { t: "noop" } ? "${SKIPPED}" : "ok") : never)`,
	`  : "the lexer returned neither tokens nor an error"`,
	`  : never;`,
];

rmSync(cache, { recursive: true, force: true });
mkdirSync(cache, { recursive: true });
/** Statements per tsc run: one run over all of them needs ~3 GB; batches keep the peak low. */
const BATCH = 6000;
const tsconfig = (files: string[]): string =>
	JSON.stringify(
		{
			extends: relative(cache, join(root, "tsconfig.base.json")),
			compilerOptions: {
				noEmit: true,
				declaration: false,
				declarationMap: false,
				sourceMap: false,
				noErrorTruncation: true,
				types: [],
			},
			files,
		},
		null,
		2,
	);
/** Test files per tsc run. */
const batches: string[][] = [[]];
let batchSize = 0;

interface Checked {
	test: string;
	stmt: Statement;
	ours?: string;
	crash?: string;
}
const checked: Checked[] = [];
/** `${test}.ts:${line}` → entry in `checked` */
const byLine = new Map<string, Checked>();
let skippedVars = 0;
let skippedStrings = 0;
for (const test of tests) {
	const outFile = join(regress, "expected", `${test}.out`);
	if (!existsSync(outFile)) fail(`no expected output for ${test}`);
	const stmts = classify(
		readFileSync(join(regress, "sql", `${test}.sql`), "utf8"),
		readFileSync(outFile, "utf8"),
	);
	const lines = [...HEADER];
	for (const stmt of stmts) {
		if (stmt.psqlVars) {
			skippedVars++;
			continue;
		}
		if (stmt.nonstandardStrings) {
			skippedStrings++;
			continue;
		}
		const entry: Checked = { test, stmt };
		checked.push(entry);
		lines.push(
			`export const s${checked.length}: "ok" = null! as R<${JSON.stringify(stmt.sql)}>; // line ${stmt.line}`,
		);
		byLine.set(`${test}.ts:${lines.length}`, entry);
	}
	writeFileSync(join(cache, `${test}.ts`), `${lines.join("\n")}\n`);
	if (batchSize > 0 && batchSize + stmts.length > BATCH) {
		batches.push([]);
		batchSize = 0;
	}
	batches.at(-1)!.push(`${test}.ts`);
	batchSize += stmts.length;
}

const started = performance.now();
for (const [n, files] of batches.entries()) {
	const config = join(cache, `tsconfig.${n}.json`);
	writeFileSync(config, tsconfig(files));
	const proc = spawnSync(tsc, ["-p", config, "--pretty", "false"], {
		encoding: "utf8",
		maxBuffer: 1 << 30,
	});
	if (proc.error) throw proc.error;
	const output = `${proc.stdout}${proc.stderr}`;
	if (proc.signal)
		fail(
			`tsc was killed (${proc.signal}) checking ${files.join(", ")}; out of memory?`,
		);
	// A diagnostic is one line; elaborations of it are indented lines that follow.
	let found = 0;
	for (const m of output.matchAll(
		/^(.*?)\((\d+),\d+\): error (TS\d+): (.*)$/gm,
	)) {
		const entry = byLine.get(`${m[1]!.replace(/^.*[\\/]/, "")}:${m[2]}`);
		if (!entry)
			fail(
				`unexpected diagnostic outside the generated statements:\n${m[0]}\n\n${output.slice(0, 4000)}`,
			);
		const type = m[4]!.match(
			/^Type '(.*)' is not assignable to type '"ok"'\.$/,
		)?.[1];
		if (m[3] === "TS2322" && type !== undefined) entry.ours ??= unquote(type);
		else entry.crash ??= `${m[3]}: ${m[4]}`;
		found++;
	}
	if (proc.status !== 0 && found === 0)
		fail(
			`tsc failed without diagnostics on ${files.join(", ")}:\n${output.slice(0, 4000)}`,
		);
}
const seconds = (performance.now() - started) / 1000;

// ───────────────────────────── compare ─────────────────────────────

/**
 * - `rejects`: Postgres parsed the statement (it ran, or failed after parsing); we report an
 *   error. When Postgres failed after parsing and ours is a semantic error too (not a syntax
 *   error, an unsupported feature or a lexical error), both reject it: agreement.
 * - `accepts`: Postgres reported a syntax error; we parse the statement. A statement the parser
 *   skips without validating (`SKIPPED`) is not counted.
 * - `position`: both report a syntax error, at different tokens (Postgres's `at or near "…"` /
 *   `at end of input` against ours).
 * - `crash`: the compiler gave up (e.g. TS2589, instantiation too deep), whatever Postgres did.
 */
function kindOf(
	e: Checked,
): "crash" | "accepts" | "rejects" | "position" | null {
	if (e.crash) return "crash";
	if (e.stmt.pg === "unknown") return null;
	if (e.stmt.pg === "syntax-error") {
		if (e.ours === undefined) return "accepts";
		if (e.ours === SKIPPED) return null;
		const pg = nearOf(e.stmt.pgError!, true);
		return pg !== null && nearOf(e.ours, false) !== pg ? "position" : null;
	}
	if (e.ours === undefined || e.ours === SKIPPED) return null;
	if (e.stmt.pg === "error" && isSemantic(e.ours)) return null;
	return "rejects";
}
/**
 * The token a syntax error points at, lowercased, or `""` for the end of input; `null` when the
 * message names no token. Postgres and our lexer quote it (`at or near "ANY"`); our parser does
 * not and may add a note after it (`at or near create: only one statement is allowed`).
 */
function nearOf(message: string, postgres: boolean): string | null {
	if (/ at end of input( at character \d+)?$/.test(message)) return "";
	const parser = postgres
		? null
		: /^syntax error(?:: .*?)? at or near (.*?)(?:: [^:]*)?$/.exec(message);
	if (parser)
		return parser[1] === "end of input" ? "" : parser[1]!.toLowerCase();
	const quoted = / at or near "(.*)"( at character \d+)?$/.exec(message);
	return quoted ? quoted[1]!.toLowerCase() : null;
}
const isSemantic = (message: string): boolean =>
	!/^syntax error|^unterminated|not supported/.test(message);

const current: Entries = {};
const tally = {
	statements: checked.length + skippedVars + skippedStrings,
	psqlVariables: skippedVars,
	nonstandardStrings: skippedStrings,
	pgUnknown: 0,
	agree: 0,
	skipped: 0,
	rejects: 0,
	accepts: 0,
	position: 0,
	crash: 0,
};
for (const e of checked) {
	const kind = kindOf(e);
	if (e.ours === SKIPPED) tally.skipped++;
	if (e.stmt.pg === "unknown" && kind === null) tally.pgUnknown++;
	else if (kind === null) tally.agree++;
	else tally[kind]++;
	if (!kind) continue;
	const test = e.test;
	current[test] ??= [];
	current[test].push({
		line: e.stmt.line,
		kind,
		hash: hashOf(e.stmt.sql),
		pg: e.stmt.pgError ?? e.stmt.pg,
		parser: e.crash ?? e.ours ?? "accepted",
		sql: preview(e.stmt.sql),
	});
}

const baseline = readBaseline(baselinePath, "mismatches");
const { added, fixed } = compareBaseline(
	current,
	scoped(baseline?.entries ?? {}, (t) => tests.includes(t)),
);

const summary = [
	`PostgreSQL ${version} regression tests (${commit.slice(0, 10)}), ${tests.length} files, tsc ${seconds.toFixed(1)} s`,
	"",
	`| Statements | Agree | Parser rejects | Parser accepts | Syntax error elsewhere | Compiler crash | Postgres outcome unknown | Not checked: psql variables | Not checked: standard_conforming_strings off |`,
	`|---|---|---|---|---|---|---|---|---|`,
	`| ${tally.statements} | ${tally.agree} | ${tally.rejects} | ${tally.accepts} | ${tally.position} | ${tally.crash} | ${tally.pgUnknown} | ${tally.psqlVariables} | ${tally.nonstandardStrings} |`,
	"",
	`${tally.skipped} statements are utility statements the parser skips to the next \`;\` without validating them (counted as agreeing unless Postgres reports a syntax error).`,
].join("\n");
console.log(summary);
const title = "PostgreSQL regression tests";
const nonzero = (pairs: [string, number][]): string[] =>
	pairs.filter(([, n]) => n).map(([k, n]) => `${k} ${n}`);
const notChecked = tally.psqlVariables + tally.nonstandardStrings;
const line = [
	`PostgreSQL ${version}, ${tests.length} files: ${tally.statements} statements`,
	`agree ${tally.agree}`,
	...nonzero([
		["parser rejects", tally.rejects],
		["parser accepts", tally.accepts],
		["syntax error elsewhere", tally.position],
		["compiler crash", tally.crash],
		["Postgres outcome unknown", tally.pgUnknown],
	]),
	...(notChecked
		? [
				`not checked ${notChecked} (${nonzero([
					["psql variables", tally.psqlVariables],
					["standard_conforming_strings off", tally.nonstandardStrings],
				]).join(", ")})`,
			]
		: []),
].join(" · ");

if (update) {
	const mismatches = only.length
		? {
				...baseline?.entries,
				...Object.fromEntries(
					tests.map((t): [string, BaselineEntry[]] => [t, []]),
				),
			}
		: {};
	Object.assign(mismatches, current);
	writeBaseline(
		baselinePath,
		{ postgres: version, commit },
		"mismatches",
		sortedEntries(mismatches),
	);
	console.log(
		`\nWrote ${relative(root, baselinePath)}: ${added.length} added, ${fixed.length} removed.`,
	);
	jobSummary(title, line);
	process.exit(0);
}

let failed = false;
if (!baseline) {
	jobSummary(title, line, ["no baseline: run `pnpm test:pg-regress --update`"]);
	console.error(
		`\nNo baseline. Run \`pnpm test:pg-regress --update\` to create ${relative(root, baselinePath)}.`,
	);
	process.exit(1);
}
if (baseline.pins.commit !== commit) {
	console.error(
		`\nbaseline.json is for PostgreSQL ${baseline.pins.postgres} (${String(baseline.pins.commit).slice(0, 10)}), vendor/postgres is ${version} (${commit.slice(0, 10)}). Run \`pnpm test:pg-regress --update\` and review the diff.`,
	);
	failed = true;
}
const show = (list: readonly Located[]): void =>
	console.error(
		showEntries(
			list,
			(m) =>
				`  ${m.group}.sql:${m.line}  [${m.kind}]  ${m.sql}\n      postgres: ${m.pg}\n      parser:   ${m.parser}`,
		),
	);
if (added.length) {
	failed = true;
	console.error(`\n${added.length} new disagreement(s) with Postgres:`);
	show(added);
}
if (fixed.length) {
	failed = true;
	console.error(
		`\n${fixed.length} disagreement(s) in baseline.json no longer occur (nice). Run \`pnpm test:pg-regress --update\` to remove them:`,
	);
	show(fixed);
}
jobSummary(title, line, [
	...(baseline.pins.commit === commit
		? []
		: [
				`the baseline is for PostgreSQL ${baseline.pins.postgres} (${String(baseline.pins.commit).slice(0, 10)}), vendor/postgres is ${version} (${commit.slice(0, 10)})`,
			]),
	...baselineProblems(added, fixed, "pnpm test:pg-regress --update"),
]);
if (failed) process.exit(1);
console.log("\nMatches baseline.json.");

// ───────────────────────────── helpers ─────────────────────────────

function git(cwd: string, ...argv: string[]): string {
	const r = spawnSync("git", ["-C", cwd, ...argv], { encoding: "utf8" });
	if (r.status !== 0)
		fail(
			`git ${argv.join(" ")} failed in ${relative(root, cwd)}:\n${r.stderr}`,
		);
	return r.stdout.trim();
}

/** The text of a string literal type as tsc prints it; other types as printed. */
function unquote(type: string): string {
	try {
		return /^".*"$/.test(type) ? (JSON.parse(type) as string) : type;
	} catch {
		return type;
	}
}

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}
