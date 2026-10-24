import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
	type Evaluated,
	evaluateTypes,
	PROBE_HEAD,
	ProbeSession,
	readAnalysis,
} from "../../src/cache/evaluate.js";
import {
	type BaselineEntry,
	type Entries,
	hashOf,
	preview,
} from "./baseline.js";
import {
	type Call,
	callsOf,
	callsOfSig,
	ENUM,
	flagDifferences,
	literalUnion,
	NEEDS_CONTEXT,
	type OurSig,
	type Proc,
	procId,
	readPick,
	runnable,
	SPECIAL,
	type Statement,
	sameSig,
	sigsOf,
	statementsOf,
	strictNulls,
} from "./calls.js";
import { compareStatement, type Ours } from "./compare.js";
import type { Disagreement } from "./kinds.js";
import { Connection, type ServerError } from "./replay.js";
import type { OracleResult } from "./result.js";
import { isCorePath, withDatabase } from "./types.js";

const here = import.meta.dirname;

const EXTENSIONS = [
	"pgcrypto",
	"uuid-ossp",
	"unaccent",
	"pg_trgm",
	"fuzzystrmatch",
];
const BATCH = 1500;
const DB_TYPE = `{ $types: { ${ENUM.name}: ${ENUM.labels.map((l) => JSON.stringify(l)).join(" | ")} } }`;

const PRELUDE = `import type { PgFunctions } from "../../../src/engine/typer/pg-functions.js";
import type { LookupFn, MatchKind, PickSig } from "../../../src/engine/typer/catalog.js";
import type { ColInfo } from "../../../src/engine/types.js";
type DB = ${DB_TYPE};
type __F<S> = S extends { readonly args: infer A; readonly ret: infer R } ? { args: A; ret: R; strict: S extends { readonly strict: infer X } ? X : "-"; nullable: S extends { readonly nullable: infer X } ? X : "-"; agg: S extends { readonly agg: true } ? true : false; window: S extends { readonly window: true } ? true : false; srf: S extends { readonly srf: true } ? true : false } : null;
type __L<E> = E extends readonly unknown[] ? { -readonly [K in keyof E]: __F<E[K]> } : [__F<E>];
type __Ok<Ps, As> = Ps extends readonly ["..."] ? true : Ps extends readonly [infer P extends string, ...infer PR] ? (As extends readonly [infer A extends ColInfo, ...infer AR] ? (MatchKind<P, A["type"]> extends false ? false : __Ok<PR, AR>) : false) : As extends readonly [] ? true : false;
type __Pick<N extends string, As extends readonly ColInfo[]> = PickSig<LookupFn<DB, N>, As> extends infer S ? (S extends { readonly args: infer Ps } ? { sig: __F<S>; ok: __Ok<Ps, As> } : null) : never;
`;

interface Item {
	readonly name: string;
	readonly st: Statement;
	readonly calls: Call[];
	strictNulls: Set<number> | null;
	run: boolean;
	result?: Evaluated;
	checked?: boolean;
}

interface Pick {
	readonly call: Call;
	result?: { sig: OurSig; ok: boolean } | null;
}

export async function functionsOracle(
	url: string,
	log: (m: string) => void,
): Promise<OracleResult> {
	const started = performance.now();
	const tally: OracleResult["tally"] = {};
	const count = (k: string, n = 1): void => {
		tally[k] = (tally[k] ?? 0) + n;
	};
	const notes: string[] = [];
	mkdirSync(join(here, ".probe"), { recursive: true });
	const session = new ProbeSession(
		join(here, "tsconfig.functions.json"),
		join(here, ".probe/__functions_probe__.ts"),
	);
	const evaluate = async (exprs: readonly string[]): Promise<Evaluated[]> => {
		const out: Evaluated[] = [];
		for (let i = 0; i < exprs.length; i += BATCH)
			out.push(
				...(await evaluateTypes(
					session,
					PROBE_HEAD + PRELUDE,
					exprs.slice(i, i + BATCH),
					isCorePath,
				)),
			);
		return out;
	};
	const dbName = "typesql_oracle_functions";
	const admin = new Connection(url);
	let conn: Connection | null = null;
	try {
		const [catNames = [], pgNames = []] = (
			await evaluate([
				"`${keyof __T.FunctionCatalog & string}`",
				"`${keyof PgFunctions & string}`",
			])
		).map(literalUnion);
		const ours = new Map<
			string,
			{ readonly from: "catalog" | "pg-functions"; readonly sigs: OurSig[] }
		>();
		const sigLists = await evaluate([
			...catNames.map((n) => `__L<__T.FunctionCatalog[${JSON.stringify(n)}]>`),
			...pgNames.map((n) => `__L<PgFunctions[${JSON.stringify(n)}]>`),
		]);
		[...catNames, ...pgNames].forEach((n, i) => {
			ours.set(n, {
				from: i < catNames.length ? "catalog" : "pg-functions",
				sigs: sigsOf(sigLists[i]!, n),
			});
		});
		const names = [...ours.keys()].sort();
		log(
			`functions oracle: ${catNames.length} catalog names (${[...ours.values()].filter((o) => o.from === "catalog").reduce((n, o) => n + o.sigs.length, 0)} signatures), ${pgNames.length} pg-functions.ts names`,
		);

		await admin.exec(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
		await admin.exec(`CREATE DATABASE ${dbName}`);
		conn = new Connection(withDatabase(url, dbName), {
			statementTimeoutMs: 2000,
		});
		await conn.exec("SET lock_timeout = '1s'");
		for (const e of EXTENSIONS)
			await conn.exec(`CREATE EXTENSION IF NOT EXISTS "${e}"`);
		await conn.exec(
			`CREATE TYPE ${ENUM.name} AS ENUM (${ENUM.labels.map((l) => `'${l}'`).join(", ")})`,
		);
		const procs = await readProcs(conn, names);
		const byName = new Map<string, Proc[]>();
		for (const p of procs)
			(byName.get(p.name) ?? byName.set(p.name, []).get(p.name)!).push(p);

		const items = new Map<string, Item>();
		const picks: Pick[] = [];
		const procSkips = new Map<string, string>();
		const add = (
			name: string,
			st: Statement,
			call: Call | null,
			run: boolean,
		): void => {
			const strict = call
				? new Set(strictNulls(call, st, procs))
				: new Set<number>();
			const it = items.get(st.text);
			if (!it)
				return void items.set(st.text, {
					name,
					st,
					calls: call ? [call] : [],
					strictNulls: strict,
					run,
				});
			if (call) it.calls.push(call);
			it.strictNulls = new Set(
				[...(it.strictNulls ?? [])].filter((i) => strict.has(i)),
			);
		};
		for (const p of procs) {
			if (NEEDS_CONTEXT[p.name]) {
				procSkips.set(procId(p), NEEDS_CONTEXT[p.name]!);
				continue;
			}
			const r = callsOf(p);
			if ("skip" in r) {
				procSkips.set(procId(p), r.skip);
				continue;
			}
			const run = runnable(p.name, procs);
			for (const call of r.calls) {
				picks.push({ call });
				for (const st of statementsOf(call)) add(p.name, st, call, run);
			}
		}
		for (const [name, sts] of Object.entries(SPECIAL))
			if (ours.has(name)) for (const st of sts) add(name, st, null, true);

		const pickExprs = picks.map(
			(p) =>
				`__Pick<${JSON.stringify(p.call.name)}, [${p.call.pickArgs.map((t) => `{ type: ${JSON.stringify(t)}; nullable: false }`).join(", ")}]>`,
		);
		const list1 = [...items.values()];
		const t0 = performance.now();
		const r1 = await evaluate([...pickExprs, ...list1.map(analysisOf)]);
		picks.forEach((p, i) => {
			p.result = readPick(r1[i]!);
		});
		list1.forEach((it, i) => {
			it.result = r1[picks.length + i]!;
		});

		const covered = new Map<string, Set<number>>();
		for (const p of picks) {
			if (!p.result?.ok) continue;
			const idx =
				ours
					.get(p.call.name)
					?.sigs.findIndex((s) => sameSig(s, p.result!.sig)) ?? -1;
			if (idx >= 0)
				(
					covered.get(p.call.name) ??
					covered.set(p.call.name, new Set()).get(p.call.name)!
				).add(idx);
		}
		const sigSkips = new Map<string, string>();
		const sigCalls = new Map<string, Item[]>();
		const before = new Set(items.keys());
		for (const name of names) {
			const o = ours.get(name)!;
			if (o.from !== "catalog") continue;
			o.sigs.forEach((s, i) => {
				if (covered.get(name)?.has(i)) return;
				const key = `${name}#${i}`;
				if (NEEDS_CONTEXT[name]) {
					sigSkips.set(key, NEEDS_CONTEXT[name]);
					return;
				}
				if (SPECIAL[name]) return;
				const r = callsOfSig(name, i, s, byName.has(name));
				if ("skip" in r) {
					sigSkips.set(key, r.skip);
					return;
				}
				const run = runnable(name, procs);
				for (const call of r.calls) {
					for (const st of statementsOf(call)) {
						add(name, st, call, run);
						(sigCalls.get(key) ?? sigCalls.set(key, []).get(key)!).push(
							items.get(st.text)!,
						);
					}
				}
			});
		}
		const list2 = [...items.values()].filter((it) => !before.has(it.st.text));
		const r2 = await evaluate(list2.map(analysisOf));
		list2.forEach((it, i) => {
			it.result = r2[i]!;
		});
		log(
			`functions oracle: ${procs.length} pg_proc overloads, ${picks.length} calls, ${items.size} statements (${list2.length} from catalog signatures), evaluated in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
		);

		const entries: Entries = {};
		const push = (group: string, e: BaselineEntry): void => {
			entries[group] ??= [];
			entries[group].push(e);
		};
		const all = [...items.values()].sort(
			(a, b) =>
				a.name.localeCompare(b.name) || a.st.text.localeCompare(b.st.text),
		);
		let runs = 0;
		let describeOnly = 0;
		const failed = new Map<string, number>();
		for (const it of all) {
			const v = await checkItem(conn, it);
			runs += v.runs;
			for (const e of v.failed) {
				const k = e.code === "57014" ? "timeout" : "error";
				failed.set(k, (failed.get(k) ?? 0) + 1);
				if (k === "timeout" && process.env["TYPESQL_ORACLE_DEBUG"])
					console.log("TIMEOUT", it.st.text);
			}
			if (!it.run) describeOnly++;
			if ("skip" in v) {
				count(`skip: ${v.skip}`);
				continue;
			}
			it.checked = true;
			if (!v.disagreements.length) {
				count("agree");
				continue;
			}
			const byKind = new Map<string, Disagreement[]>();
			for (const d of v.disagreements)
				(byKind.get(d.kind) ?? byKind.set(d.kind, []).get(d.kind)!).push(d);
			for (const [kind, ds] of byKind) {
				count(kind);
				if (process.env["TYPESQL_ORACLE_DEBUG"])
					console.log(
						"DEBUG",
						JSON.stringify({ text: it.st.text, ours: it.result, detail: ds }),
					);
				push(it.name, {
					kind,
					hash: hashOf(it.st.text),
					detail: ds.map((d) => d.detail).join("; "),
					sql: preview(it.st.text),
				});
			}
		}

		let flagChecks = 0;
		const flagged = new Set<string>();
		for (const p of picks) {
			const proc = p.call.proc!;
			if (!p.result || flagged.has(procId(proc))) continue;
			flagChecks++;
			const diffs = flagDifferences(proc, p.result.sig);
			if (!diffs.length) continue;
			flagged.add(procId(proc));
			count("unsound");
			push(proc.name, {
				kind: "unsound",
				hash: hashOf(`flags ${procId(proc)}`),
				detail: `${procId(proc)} is ${diffs.join(", ")}`,
				sql: `flags of ${procId(proc)}`,
			});
		}

		const checkedNames = new Set(
			all.filter((it) => it.checked).map((it) => it.name),
		);
		const nameSkips = new Map<string, number>();
		const fnCount = { catalog: [0, 0], "pg-functions": [0, 0] } as Record<
			string,
			[number, number]
		>;
		for (const name of names) {
			const o = ours.get(name)!;
			fnCount[o.from]![1]++;
			if (checkedNames.has(name)) {
				fnCount[o.from]![0]++;
				continue;
			}
			const mine = byName.get(name) ?? [];
			const reason =
				NEEDS_CONTEXT[name] ??
				(mine.length
					? [
							...new Set(
								mine.map(
									(p) => procSkips.get(procId(p)) ?? "statements skipped",
								),
							),
						]
							.sort()
							.join(", ")
					: "not in pg_proc");
			nameSkips.set(reason, (nameSkips.get(reason) ?? 0) + 1);
			if (process.env["TYPESQL_ORACLE_DEBUG"])
				console.log("SKIP-FN", name, reason);
		}
		const sigTotal = [...ours.values()]
			.filter((o) => o.from === "catalog")
			.reduce((n, o) => n + o.sigs.length, 0);
		let viaProc = 0;
		let viaSig = 0;
		const sigSkipCounts = new Map<string, number>();
		for (const name of names) {
			const o = ours.get(name)!;
			if (o.from !== "catalog") continue;
			o.sigs.forEach((_, i) => {
				const key = `${name}#${i}`;
				if (covered.get(name)?.has(i)) viaProc++;
				else if (SPECIAL[name] && checkedNames.has(name)) viaSig++;
				else if (sigCalls.get(key)?.some((it) => it.checked)) {
					viaSig++;
					if (process.env["TYPESQL_ORACLE_DEBUG"])
						console.log(
							"SIG-CALLS",
							key,
							sigCalls
								.get(key)!
								.map((it) => it.st.text)
								.join(" ;; "),
						);
				} else {
					const reason = sigSkips.get(key) ?? "statements skipped";
					sigSkipCounts.set(reason, (sigSkipCounts.get(reason) ?? 0) + 1);
					if (process.env["TYPESQL_ORACLE_DEBUG"])
						console.log("SKIP-SIG", key, reason);
				}
			});
		}
		const procSkipCounts = new Map<string, number>();
		for (const r of procSkips.values())
			procSkipCounts.set(r, (procSkipCounts.get(r) ?? 0) + 1);
		const show = (m: Map<string, number>): string =>
			[...m]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k, n]) => `${k}: ${n}`)
				.join(", ") || "none";
		const forms = new Map<string, number>();
		for (const it of all)
			forms.set(it.st.form, (forms.get(it.st.form) ?? 0) + 1);
		notes.push(
			`functions: ${fnCount.catalog![0]}/${fnCount.catalog![1]} catalog and ${fnCount["pg-functions"]![0]}/${fnCount["pg-functions"]![1]} pg-functions.ts names checked; skipped: ${show(nameSkips)}`,
			`catalog signatures: ${viaProc + viaSig}/${sigTotal} checked (${viaProc} through pg_proc overloads, ${viaSig} by their own calls); skipped: ${show(sigSkipCounts)}`,
			`pg_proc overloads: ${procs.length - procSkips.size}/${procs.length} called; skipped: ${show(procSkipCounts)}`,
			`statements: ${all.length} (${show(forms)}), ${describeOnly} describe-only (volatile), ${runs} runs (failed: ${show(failed)}); flags compared for ${flagChecks} overloads`,
		);
		log(
			`functions oracle: done in ${((performance.now() - started) / 1000).toFixed(1)} s`,
		);
		return { entries, tally, notes };
	} finally {
		await conn?.close();
		await admin
			.exec(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
			.catch(() => undefined);
		await admin.close();
		await session.dispose();
	}
}

const analysisOf = (it: Item): string =>
	`__T.CacheAnalysis<DB, ${JSON.stringify(it.st.text)}>`;

async function readProcs(
	conn: Connection,
	names: readonly string[],
): Promise<Proc[]> {
	// arrays as `elem[]`, as compare.ts spells them
	const typeName =
		"CASE WHEN t.typcategory = 'A' AND e.oid IS NOT NULL AND t.typname LIKE '\\_%' THEN e.typname || '[]' ELSE t.typname END";
	const rows = await conn.sql.unsafe<
		{
			schema: string;
			name: string;
			args: string;
			defaults: number;
			variadic: string | null;
			kind: string;
			aggkind: string | null;
			direct: number;
			retset: boolean;
			strict: boolean;
			volatile: string;
			ret: string;
			outcols: boolean;
		}[]
	>(
		`SELECT n.nspname::text AS schema, p.proname::text AS name,
            coalesce((SELECT string_agg(${typeName}, ',' ORDER BY a.i) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY a(oid, i) JOIN pg_type t ON t.oid = a.oid LEFT JOIN pg_type e ON e.oid = t.typelem), '') AS args,
            p.pronargdefaults::int4 AS defaults,
            (SELECT ${typeName} FROM pg_type t LEFT JOIN pg_type e ON e.oid = t.typelem WHERE t.oid = p.provariadic) AS variadic,
            p.prokind::text AS kind, ag.aggkind::text AS aggkind, coalesce(ag.aggnumdirectargs, 0)::int4 AS direct,
            p.proretset AS retset, p.proisstrict AS strict, p.provolatile::text AS volatile, format_type(p.prorettype, NULL) AS ret,
            coalesce(p.proargmodes::text[] && ARRAY['o', 't', 'b'], false) AS outcols
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace LEFT JOIN pg_aggregate ag ON ag.aggfnoid = p.oid
      WHERE n.nspname IN ('pg_catalog', 'public') AND p.proname = ANY(string_to_array($1, ','))`,
		[names.join(",")],
	);
	const procs = rows.map(
		(r): Proc => ({
			...r,
			args: r.args ? r.args.split(",") : [],
			outCols: r.outcols,
		}),
	);
	// pg_catalog wins a tie: it is searched first
	const seen = new Set<string>();
	return procs
		.sort(
			(a, b) =>
				a.name.localeCompare(b.name) ||
				a.args.join(",").localeCompare(b.args.join(",")) ||
				(a.schema === "pg_catalog" ? -1 : b.schema === "pg_catalog" ? 1 : 0),
		)
		.filter((p) => {
			const k = procId(p);
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		});
}

function oursOf(it: Item): Ours {
	const r = it.result;
	if (!r) return { crash: "not evaluated" };
	if ("error" in r) return { crash: r.error };
	const a = readAnalysis(r.text);
	return "error" in a ? { error: a.error } : { analysis: a };
}

type Checked = (
	| { readonly disagreements: readonly Disagreement[] }
	| { readonly skip: string }
) & { readonly runs: number; readonly failed: readonly ServerError[] };

async function checkItem(conn: Connection, it: Item): Promise<Checked> {
	const ours = oursOf(it);
	const d = await conn.describe(it.st.text);
	if ("error" in d)
		return {
			...compareStatement(ours, { error: d.error }),
			runs: 0,
			failed: [],
		};
	const columns = await Promise.all(
		d.columns.map(async (c) => ({
			name: c.name,
			type: await conn.typeName(c.type),
		})),
	);
	const params = await Promise.all(d.params.map((p) => conn.typeName(p)));
	const rows: (readonly unknown[])[] = [];
	const runErrors: ServerError[] = [];
	let runs = 0;
	let succeeded = 0;
	const once = async (text: string): Promise<(readonly unknown[])[] | null> => {
		runs++;
		await conn.exec("BEGIN");
		try {
			const r = await conn.run(text);
			if ("error" in r) return (void runErrors.push(r.error), null);
			succeeded++;
			return r.rows as (readonly unknown[])[];
		} finally {
			await conn.exec("ROLLBACK");
		}
	};
	if (it.run && !("crash" in ours)) {
		const whole = await once(it.st.text);
		if (whole) rows.push(...whole);
		else if (it.st.columns.length > 1) {
			for (const [i, c] of it.st.columns.entries()) {
				const alone = await once(`SELECT ${c.expr}${it.st.tail}`);
				if (alone)
					rows.push(
						...alone.map((r) =>
							columns.map((_, j) => (j === i ? r[0] : undefined)),
						),
					);
			}
		}
	}
	for (const i of it.strictNulls ?? [])
		if (i < columns.length)
			rows.push(columns.map((_, j) => (j === i ? null : undefined)));
	// a statement we reject agrees with a server that accepts it but fails every run of it
	const v = compareStatement(ours, {
		observed: {
			columns,
			params,
			rows,
			runs,
			runErrors: runs && !succeeded ? runErrors : [],
		},
	});
	return { ...v, runs, failed: runErrors };
}
