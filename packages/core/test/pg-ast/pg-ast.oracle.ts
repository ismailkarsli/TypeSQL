import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";
import {
	type BaselineEntry,
	compareBaseline,
	type Entries,
	hashOf,
	preview,
	readBaseline,
	scoped,
	showEntries,
	sortedEntries,
	writeBaseline,
} from "../oracle/baseline.js";
import { baselineProblems, counts, jobSummary } from "../oracle/job-summary.js";
import type { ProbeSession } from "../support/evaluate.js";
import { evaluateCanon, probeSession } from "./ours.js";
import { OUT } from "./pg-canon.js";
import { RejectionAudit } from "./rejections.js";
import {
	corpusStatements,
	diffWindow,
	regressionStatements,
	regressionTests,
	root,
	type Statement,
	stringLiteral,
	type Tally,
} from "./statements.js";

const here = import.meta.dirname;
const baselinePath = join(here, "baseline.json");
const update = process.env["TYPESQL_PG_AST_UPDATE"] === "1";
const only = (process.env["TYPESQL_PG_AST_TESTS"] ?? "")
	.split(",")
	.filter(Boolean);
const BATCH = Number(process.env["TYPESQL_PG_AST_BATCH"] ?? 2000);
const JOBS = Number(process.env["TYPESQL_PG_AST_JOBS"] ?? 2);
const log = (m: string): void => console.log(m);
const debug = process.env["TYPESQL_PG_AST_DEBUG"];

test("parse trees against PostgreSQL's parser", async () => {
	const started = performance.now();
	const vendor = join(root, "vendor/postgres");
	const dirty = git(vendor, "status", "--porcelain");
	if (dirty)
		throw new Error(
			`vendor/postgres has local changes:\n${dirty}\nThe official tests must never be modified.`,
		);
	const commit = git(vendor, "rev-parse", "HEAD");
	const version =
		/^\s*version:\s*'([^']+)'/m.exec(
			readFileSync(join(vendor, "meson.build"), "utf8"),
		)?.[1] ?? "unknown";

	const tally: Tally = {};
	const count = (k: string, n = 1): void => {
		tally[k] = (tally[k] ?? 0) + n;
	};
	const tests = regressionTests([]).filter(
		(t) => !only.length || only.includes(t),
	);
	mkdirSync(join(here, ".probe"), { recursive: true });
	const sessions: ProbeSession[] = [probeSession("0")];
	const entries: Entries = {};
	const audit = new RejectionAudit(version);
	const rejectionFailures: string[] = [];
	const groups = new Set<string>(tests);
	let total = 0;
	let evalSeconds = 0;
	try {
		const statements: Statement[] = [
			...(await regressionStatements(tests, tally)),
			...(await corpusStatements(only, tally)),
		];
		total =
			statements.length + Object.values(tally).reduce((sum, n) => sum + n, 0);
		for (const s of statements) groups.add(s.group);
		const inScope = statements.filter((s) => s.pg !== OUT);
		count("skip: out-of-scope", statements.length - inScope.length);
		log(`pg-ast: ${inScope.length} statements to compare`);

		const texts = [...new Set(inScope.map((s) => s.sql))];
		const t0 = performance.now();
		const ours = await evaluateCanon(texts, {
			batch: BATCH,
			jobs: JOBS,
			sessions,
			progress: (n) =>
				log(
					`pg-ast: evaluated ${n} / ${texts.length} (${((performance.now() - t0) / 1000).toFixed(0)} s)`,
				),
		});
		evalSeconds = (performance.now() - t0) / 1000;

		for (const s of inScope) {
			const r = ours.get(s.sql)!;
			let entry: BaselineEntry | null = null;
			if ("error" in r)
				entry = {
					kind: "crash",
					hash: hashOf(s.sql),
					detail: r.error.slice(0, 200),
				};
			else {
				const text = stringLiteral(r.text) ?? r.text;
				if (/^`?!/.test(text)) {
					const rejection = text.replace(/^`?!/, "");
					const problem = await audit.verify(s, rejection);
					if (problem)
						rejectionFailures.push(
							`${s.group}${s.line === null ? "" : `.sql:${s.line}`}: ${s.sql}\n      TypeSQL: ${rejection}\n      ${problem}`,
						);
					else count("agree");
					if (debug)
						appendFileSync(
							debug,
							`${JSON.stringify({ group: s.group, line: s.line, sql: s.sql, rejects: text })}\n`,
						);
				} else if (text === s.pg) count("agree");
				else {
					if (debug)
						appendFileSync(
							debug,
							`${JSON.stringify({ group: s.group, line: s.line, sql: s.sql, ours: text, pg: s.pg })}\n`,
						);
					const [o, p] = diffWindow(text, s.pg);
					entry = { kind: "parse", hash: hashOf(s.sql), ours: o, pg: p };
				}
			}
			if (!entry) continue;
			count(entry.kind);
			const group = s.group;
			entries[group] ??= [];
			entries[group].push({
				...(s.line === null ? {} : { line: s.line }),
				...entry,
				sql: preview(s.sql),
			});
		}
		rejectionFailures.push(...audit.stale(only));
	} finally {
		await Promise.all([audit.close(), ...sessions.map((s) => s.dispose())]);
	}

	const baseline = readBaseline(baselinePath, "disagreements");
	const keep = (g: string): boolean => !only.length || groups.has(g);
	const { added, fixed } = compareBaseline(
		entries,
		scoped(baseline?.entries ?? {}, keep),
	);
	const results = {
		total,
		agreed: tally.agree ?? 0,
		skipped: Object.entries(tally)
			.filter(([k]) => k.startsWith("skip: "))
			.reduce((sum, [, n]) => sum + n, 0),
		...(tally.parse ? { parse: tally.parse } : {}),
		...(tally.crash ? { crash: tally.crash } : {}),
	};
	const order = ["total", "agreed", "parse", "skipped", "crash"];
	const summary = `Parse trees against PostgreSQL ${version} (${commit.slice(0, 10)}): ${counts(results, order)}; evaluated in ${evalSeconds.toFixed(0)} s, ${((performance.now() - started) / 1000).toFixed(0)} s in all`;
	log(summary);
	const title = "Parse trees (pg-ast)";
	const line = `PostgreSQL ${version}: ${counts(results, order)}`;
	const show = (list: Parameters<typeof showEntries>[0]) =>
		showEntries(
			list,
			(e) =>
				`  ${e.group}${e["line"] === undefined ? "" : `.sql:${String(e["line"])}`}  [${e.kind}]  ${String(e["sql"])}\n${e.kind === "crash" ? `      ${String(e["detail"])}` : `      ours: ${String(e["ours"])}\n      pg:   ${String(e["pg"])}`}`,
		);
	const errors = compareBaseline(entries, {}).added;
	const explicitProblems = [
		...rejectionFailures,
		...(errors.length
			? [`${errors.length} parser error(s), including baselined disagreements`]
			: []),
	];
	if (explicitProblems.length) {
		jobSummary(title, line, explicitProblems);
		throw new Error(
			[
				...(rejectionFailures.length
					? [
							`Unverified TypeSQL rejection(s):\n${rejectionFailures.join("\n\n")}`,
						]
					: []),
				...(errors.length
					? [`${errors.length} parser error(s):\n${show(errors)}`]
					: []),
			].join("\n\n"),
		);
	}

	if (update) {
		const merged: Entries = only.length
			? Object.fromEntries(
					Object.entries(baseline?.entries ?? {}).filter(([g]) => !keep(g)),
				)
			: {};
		Object.assign(merged, entries);
		jobSummary(title, line);
		writeBaseline(
			baselinePath,
			{ postgres: version, commit },
			"disagreements",
			sortedEntries(merged),
		);
		log(
			`Wrote ${relative(root, baselinePath)}: ${added.length} added, ${fixed.length} removed.`,
		);
		return;
	}
	const failures: string[] = [];
	const problems: string[] = [];
	if (!baseline) {
		problems.push("no baseline: run `pnpm test:pg-ast --update`");
		failures.push(
			`No baseline. Run \`pnpm test:pg-ast --update\` to create ${relative(root, baselinePath)}.`,
		);
	} else {
		problems.push(
			...baselineProblems(added, fixed, "pnpm test:pg-ast --update"),
		);
		if (baseline.pins["commit"] !== commit) {
			problems.unshift(
				`the baseline is for PostgreSQL ${String(baseline.pins["postgres"])} (${String(baseline.pins["commit"]).slice(0, 10)}), vendor/postgres is ${version} (${commit.slice(0, 10)})`,
			);
			failures.push(
				`baseline.json is for PostgreSQL ${String(baseline.pins["postgres"])} (${String(baseline.pins["commit"]).slice(0, 10)}), vendor/postgres is ${version} (${commit.slice(0, 10)}). Run \`pnpm test:pg-ast --update\` and review the diff.`,
			);
		}
		if (added.length)
			failures.push(
				`${added.length} new disagreement(s) with PostgreSQL's parser:\n${show(added)}`,
			);
		if (fixed.length)
			failures.push(
				`${fixed.length} disagreement(s) in baseline.json no longer occur (nice). Run \`pnpm test:pg-ast --update\` to remove them:\n${show(fixed)}`,
			);
	}
	jobSummary(title, line, problems);
	expect(failures.join("\n\n")).toBe("");
});

function git(cwd: string, ...argv: string[]): string {
	const r = spawnSync("git", ["-C", cwd, ...argv], { encoding: "utf8" });
	if (r.status !== 0)
		throw new Error(`git ${argv.join(" ")} failed in ${cwd}:\n${r.stderr}`);
	return r.stdout.trim();
}
