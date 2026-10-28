import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { loadModule, parseSync } from "libpg-query";
import { discover } from "../../src/cache/discover.js";
import { PROBE_HEAD, type ProbeSession } from "../../src/cache/evaluate.js";
import { hashOf } from "../oracle/baseline.js";
import { comparisonSkip } from "../oracle/comparison-skips.js";
import { isCorePath, positional } from "../oracle/types.js";
import { OUT, PgCanon } from "./pg-canon.js";

export const root = join(import.meta.dirname, "../../../..");
export const regress = join(root, "vendor/postgres/src/test/regress");

export interface Statement {
	readonly group: string;
	readonly line: number | null;
	readonly sql: string;
	readonly pg: string;
	/** Official server outcome, read from the regression test's expected output. */
	readonly outcome?: string;
	readonly pgError?: string;
}

export type Tally = { [outcome: string]: number };

interface PsqlStatement {
	readonly sql: string;
	readonly line: number;
	readonly psqlVars: boolean;
	readonly nonstandardStrings: boolean;
	readonly pg?: string;
	readonly pgError?: string;
}
type Classify = (sqlText: string, outText: string) => PsqlStatement[];

export function regressionTests(only: readonly string[]): string[] {
	if (!existsSync(join(regress, "sql")))
		throw new Error(
			"vendor/postgres is not checked out. Run `pnpm pg-regress:setup`.",
		);
	return readdirSync(join(regress, "sql"))
		.filter((f) => f.endsWith(".sql"))
		.map((f) => f.slice(0, -4))
		.filter((t) => !only.length || only.includes(t))
		.sort();
}

let loaded: Promise<void> | undefined;
export const loadParser = (): Promise<void> => (loaded ??= loadModule());

export function pgStatements(sql: string): [string, string][] | null {
	let parsed: ReturnType<typeof parseSync>;
	try {
		parsed = parseSync(sql);
	} catch {
		return null;
	}
	const bytes = Buffer.from(sql, "utf8");
	const stmts = parsed.stmts ?? [];
	if (stmts.length === 1)
		return [[sql, new PgCanon(sql).stmt(stmts[0]!.stmt as never)]];
	return stmts.map((s) => {
		const start = s.stmt_location ?? 0;
		const text = bytes
			.subarray(start, s.stmt_len ? start + s.stmt_len : undefined)
			.toString("utf8")
			.trim();
		// canonical form from a parse of the statement alone, so locations are its own
		const own = parseSync(text).stmts?.[0];
		return [text, own ? new PgCanon(text).stmt(own.stmt as never) : OUT];
	});
}

export async function regressionStatements(
	tests: readonly string[],
	tally: Tally,
): Promise<Statement[]> {
	await loadParser();
	const { classify } = (await import(
		pathToFileURL(join(root, "packages/core/test/pg-regress/psql.ts")).href
	)) as { classify: Classify };
	const count = (k: string): void => {
		tally[k] = (tally[k] ?? 0) + 1;
	};
	const out: Statement[] = [];
	for (const test of tests) {
		const stmts = classify(
			readFileSync(join(regress, "sql", `${test}.sql`), "utf8"),
			readFileSync(join(regress, "expected", `${test}.out`), "utf8"),
		);
		for (const s of stmts) {
			if (s.psqlVars) count("skip: psql-variable");
			else if (s.nonstandardStrings) count("skip: nonstandard-strings");
			else add(out, test, s.line, s.sql, count, s);
		}
	}
	return out;
}

function add(
	out: Statement[],
	group: string,
	line: number | null,
	sql: string,
	count: (k: string) => void,
	expected?: PsqlStatement,
): void {
	const pg = pgStatements(sql);
	if (!pg) {
		count("skip: postgres-rejects");
		return;
	}
	if (!pg.length) {
		count("skip: empty");
		return;
	}
	for (const [text, canon] of pg) {
		const skip = comparisonSkip("pg-ast", group, hashOf(text));
		if (skip) {
			count(`skip: ${skip}`);
			continue;
		}
		out.push({
			group,
			line,
			sql: text,
			pg: canon,
			// A split query's combined outcome cannot establish which part failed.
			...(pg.length === 1 && expected
				? { outcome: expected.pg, pgError: expected.pgError }
				: {}),
		});
	}
}

export async function typeTestStatements(
	session: ProbeSession,
	only: readonly string[],
	tally: Tally,
): Promise<Statement[]> {
	await loadParser();
	const count = (k: string): void => {
		tally[k] = (tally[k] ?? 0) + 1;
	};
	const { program, checker } = await session.withProbe(PROBE_HEAD);
	const kinds = (await session.typescript()).kinds;
	const sites = await discover(
		program,
		checker,
		kinds,
		isCorePath,
		(f) => f.includes(`${sep}test${sep}types${sep}`) && !f.endsWith(".d.ts"),
	);
	const seen = new Set<string>();
	const out: Statement[] = [];
	const each = (site: { key: string; file: string }, ddl: boolean): void => {
		const group = basename(site.file);
		if (only.length && !only.includes(group)) return;
		const text = ddl ? site.key : positional(site.key);
		if (seen.has(`${group}\0${text}`)) return;
		seen.add(`${group}\0${text}`);
		add(out, group, null, text, count);
	};
	for (const s of sites.sql) {
		if (only.length && !only.includes(basename(s.file))) continue;
		if (s.slots) count("skip: slots");
		else each(s, false);
	}
	for (const s of sites.types) each(s, false);
	for (const s of sites.ddl) each(s, true);
	return out;
}

export function stringLiteral(printed: string): string | null {
	if (!/^"(?:[^"\\]|\\.)*"$/s.test(printed)) return null;
	return printed
		.slice(1, -1)
		.replace(
			/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|0|.)/gs,
			(_, e: string) => {
				if (e.startsWith("u{"))
					return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
				if (e[0] === "u" && e.length === 5)
					return String.fromCharCode(parseInt(e.slice(1), 16));
				if (e[0] === "x" && e.length === 3)
					return String.fromCharCode(parseInt(e.slice(1), 16));
				return (
					(
						{
							"0": "\0",
							n: "\n",
							t: "\t",
							r: "\r",
							b: "\b",
							f: "\f",
							v: "\v",
						} as Record<string, string>
					)[e] ?? e
				);
			},
		);
}

export function diffWindow(
	a: string,
	b: string,
	before = 30,
	after = 70,
): [string, string] {
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	const cut = (s: string): string =>
		`${i - before > 0 ? "…" : ""}${s.slice(Math.max(0, i - before), i + after)}${i + after < s.length ? "…" : ""}`;
	return [cut(a), cut(b)];
}
