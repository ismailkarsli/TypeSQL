import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import {
	type Evaluated,
	evaluateTypes,
	PROBE_HEAD,
	ProbeSession,
} from "../../src/cache/evaluate.js";
import { hashOf } from "../oracle/baseline.js";
import { evaluateInBatches, orderDependent } from "../oracle/batches.js";
import { compareStatement, type Server } from "../oracle/compare.js";
import type { Disagreement } from "../oracle/kinds.js";
import { Connection } from "../oracle/replay.js";
import {
	type Db,
	dbTypeText,
	EXTENSIONS,
	type Relation,
	schemaDdl,
	seedRows,
	tablesOf,
} from "../oracle/schema.js";
import {
	type Candidate,
	isCorePath,
	observe,
	oursOf,
	withDatabase,
} from "../oracle/types.js";
import { kinds, type Node, parserStatements, statement } from "./gen.js";
import { fuzzDbType, fuzzSetup, MOOD, TABLES } from "./schema.js";

export type Property = "rejects" | "types" | "nulls" | "accepts" | "crash";

export interface Checked {
	readonly sql: string;
	readonly failures: readonly {
		readonly property: Property;
		readonly detail: string;
	}[];
	readonly nullable: number;
	readonly nulled: number;
	readonly ours: Evaluated;
}

export interface Failure {
	readonly property: Property;
	readonly detail: string;
	readonly signature: string;
	readonly sql: string;
	readonly original: string;
	readonly ours: string;
	readonly source: string;
}

export interface FuzzReport {
	readonly seed: number;
	readonly runs: number;
	readonly checked: number;
	readonly failing: number;
	readonly counts: { [property: string]: number };
	readonly nullRatio: { readonly nulled: number; readonly nullable: number };
	readonly failures: readonly Failure[];
	readonly failingStatements: readonly {
		readonly sql: string;
		readonly property: Property;
		readonly detail: string;
		readonly source: string;
	}[];
	readonly replayed: readonly {
		readonly sql: string;
		readonly key: string;
		readonly failing: boolean;
		readonly detail: string;
	}[];
	readonly ms: number;
}

export interface FuzzOptions {
	readonly seed: number;
	readonly runs: number;
	readonly shrink: number;
	readonly replay: readonly { readonly sql: string; readonly key: string }[];
	readonly log: (m: string) => void;
}

const here = import.meta.dirname;
const DATABASE = "typesql_fuzz";
const BASE = `${PROBE_HEAD}type FDB = ${fuzzDbType()};\n`;
const FUZZ_DB: Db = {
	namespaces: [],
	relations: [],
	enums: { mood: [...MOOD] },
	unsupported: [],
};
const TABLE_NAMES = TABLES.map((t) => `public.${t.name}`);

function propertyOf(d: Disagreement): Property {
	if (d.kind === "rejects") return "rejects";
	if (d.kind === "accepts") return "accepts";
	if (d.kind === "crash") return "crash";
	return /typed non-null/.test(d.detail) ? "nulls" : "types";
}

export function corpus(): { sql: string; key: string }[] {
	const dir = join(here, "corpus");
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith(".sql"))
		.sort()
		.map((f) => ({
			key: `corpus/${f}`,
			sql: readFileSync(join(dir, f), "utf8")
				.replace(/^(--[^\n]*\n|\s)*/, "")
				.replace(/;\s*$/, "")
				.trim(),
		}));
}

export function candidates(): Candidate[] {
	const path = join(here, "corpus/candidates.json");
	return existsSync(path)
		? (JSON.parse(readFileSync(path, "utf8")) as Candidate[])
		: [];
}

export class Fuzzer {
	private readonly session = new ProbeSession(
		join(here, "tsconfig.json"),
		join(here, ".probe/__fuzz_probe__.ts"),
	);
	private conn: Connection | null = null;
	private readonly url: string;

	constructor(url: string) {
		this.url = url;
		mkdirSync(join(here, ".probe"), { recursive: true });
	}

	async setup(): Promise<void> {
		const admin = new Connection(this.url);
		try {
			await admin.exec(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
			await admin.exec(`CREATE DATABASE ${DATABASE}`);
		} finally {
			await admin.close();
		}
		this.conn = new Connection(withDatabase(this.url, DATABASE), {
			statementTimeoutMs: 5_000,
		});
		for (const s of fuzzSetup()) await this.conn.exec(s);
	}

	async close(): Promise<void> {
		await this.conn?.close();
		await this.session.dispose().catch(() => undefined);
		const admin = new Connection(this.url);
		try {
			await admin.exec(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
		} finally {
			await admin.close();
		}
	}

	async evaluate(
		sqls: readonly string[],
		log?: (m: string) => void,
	): Promise<Evaluated[]> {
		const exprs = sqls.map(
			(s) => `__T.CacheAnalysis<FDB, ${JSON.stringify(s)}>`,
		);
		if (exprs.length === 1)
			return evaluateTypes(this.session, BASE, exprs, isCorePath);
		return evaluateInBatches(this.session, () => BASE, exprs, isCorePath, {
			size: 500,
			timeoutMs: 300_000,
			isolate: orderDependent,
			...(log ? { log } : {}),
		});
	}

	async check(sql: string, ours: Evaluated): Promise<Checked> {
		const o = oursOf({ result: ours });
		const server: Server = await observe(
			this.conn!,
			FUZZ_DB,
			TABLE_NAMES,
			sql,
			o,
		);
		const v = compareStatement(o, server);
		const failures =
			"skip" in v
				? []
				: v.disagreements.map((d) => ({
						property: propertyOf(d),
						detail: d.detail,
					}));
		let nullable = 0;
		let nulled = 0;
		if (
			"analysis" in o &&
			"observed" in server &&
			o.analysis.cols.length === server.observed.columns.length &&
			!o.analysis.cols.some((c) => c.star)
		) {
			o.analysis.cols.forEach((c, i) => {
				if (!c.nullable) return;
				nullable++;
				if (server.observed.rows.some((r) => r[i] === null)) nulled++;
			});
		}
		return { sql, failures, nullable, nulled, ours };
	}

	async checkOne(sql: string): Promise<Checked> {
		const [ours] = await this.evaluate([sql]);
		return this.check(sql, ours!);
	}

	async checkCandidates(
		list: readonly Candidate[],
		log: (m: string) => void,
	): Promise<{ candidate: Candidate; checked: Checked }[]> {
		const groups = new Map<string, Candidate[]>();
		for (const c of list) {
			const id = hashOf(JSON.stringify(c.db)).slice(0, 10);
			(groups.get(id) ?? groups.set(id, []).get(id)!).push(c);
		}
		const out: { candidate: Candidate; checked: Checked }[] = [];
		for (const [id, cs] of groups) {
			const db = cs[0]!.db;
			const ours = await evaluateTypes(
				this.session,
				`${PROBE_HEAD}type C = ${dbTypeText(db)};\n`,
				cs.map((c) => `__T.CacheAnalysis<C, ${JSON.stringify(c.sql)}>`),
				isCorePath,
			);
			const name = `typesql_fuzz_c${id}`;
			const admin = new Connection(this.url);
			await admin.exec(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
			await admin.exec(`CREATE DATABASE ${name}`);
			const conn = new Connection(withDatabase(this.url, name), {
				statementTimeoutMs: 5_000,
			});
			try {
				for (const e of EXTENSIONS)
					await conn.exec(
						`CREATE EXTENSION IF NOT EXISTS "${e}" SCHEMA pg_catalog`,
					);
				const created: Relation[] = [];
				for (const st of schemaDdl(db))
					if (!(await conn.tryExec(st.sql)) && st.relation)
						created.push(st.relation);
				for (const r of created)
					for (const row of seedRows(db, r)) await conn.tryExec(row);
				for (const [k, c] of cs.entries()) {
					const o = oursOf({ result: ours[k]! });
					const v = compareStatement(
						o,
						await observe(conn, db, tablesOf(created), c.sql, o),
					);
					const failures =
						"skip" in v
							? []
							: v.disagreements.map((d) => ({
									property: propertyOf(d),
									detail: d.detail,
								}));
					out.push({
						candidate: c,
						checked: {
							sql: c.sql,
							failures,
							nullable: 0,
							nulled: 0,
							ours: ours[k]!,
						},
					});
				}
			} finally {
				await conn.close();
				await admin.exec(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
				await admin.close();
			}
		}
		log(
			`fuzz: ${list.length} view-oracle candidates over ${groups.size} schemas`,
		);
		return out;
	}
}

export async function fuzz(url: string, o: FuzzOptions): Promise<FuzzReport> {
	const started = performance.now();
	const f = new Fuzzer(url);
	await f.setup();
	try {
		const arb = statement();
		const generated =
			o.runs > 0 ? fc.sample(arb, { seed: o.seed, numRuns: o.runs }) : [];
		const seeds = [
			...corpus(),
			...parserStatements().map((sql, i) => ({
				sql,
				key: `corpus/parser-${i}`,
			})),
		];
		const items = [
			...seeds.map((c) => ({
				sql: c.sql,
				source: c.key,
				node: null as Node | null,
				index: -1,
			})),
			...generated.map((node, index) => ({
				sql: node.sql,
				source: `seed ${o.seed} #${index}`,
				node,
				index,
			})),
		];
		o.log(
			`fuzz: ${seeds.length} corpus statements, ${generated.length} generated (seed ${o.seed})`,
		);
		const t0 = performance.now();
		const ours = await f.evaluate(
			items.map((i) => i.sql),
			(m) =>
				o.log(`fuzz: ${m} (${((performance.now() - t0) / 1000).toFixed(0)} s)`),
		);
		const counts: FuzzReport["counts"] = {};
		let nullable = 0;
		let nulled = 0;
		const failingStatements: {
			sql: string;
			property: Property;
			detail: string;
			source: string;
		}[] = [];
		const toShrink = new Map<
			string,
			{
				item: (typeof items)[number];
				property: Property;
				detail: string;
				ours: Evaluated;
			}
		>();
		for (const [k, item] of items.entries()) {
			const c = await f.check(item.sql, ours[k]!);
			nullable += c.nullable;
			nulled += c.nulled;
			const byProperty = new Map<Property, string[]>();
			for (const x of c.failures)
				(
					byProperty.get(x.property) ??
					byProperty.set(x.property, []).get(x.property)!
				).push(x.detail);
			for (const [property, details] of byProperty) {
				counts[property] = (counts[property] ?? 0) + 1;
				failingStatements.push({
					sql: item.sql,
					property,
					detail: details.join("; "),
					source: item.source,
				});
				const pre = `${property}:${item.node ? kinds(item.node).join(",") : item.source}`;
				if (!toShrink.has(pre))
					toShrink.set(pre, {
						item,
						property,
						detail: details.join("; "),
						ours: ours[k]!,
					});
			}
		}
		for (const { candidate, checked: c } of await f.checkCandidates(
			o.runs > 0 || !o.replay.length ? candidates() : [],
			o.log,
		)) {
			const byProperty = new Map<Property, string[]>();
			for (const x of c.failures)
				(
					byProperty.get(x.property) ??
					byProperty.set(x.property, []).get(x.property)!
				).push(x.detail);
			for (const [property, details] of byProperty) {
				counts[property] = (counts[property] ?? 0) + 1;
				failingStatements.push({
					sql: c.sql,
					property,
					detail: details.join("; "),
					source: `corpus/candidates.json`,
				});
			}
			void candidate;
		}
		o.log(
			`fuzz: checked ${items.length} statements in ${((performance.now() - t0) / 1000).toFixed(0)} s; ${failingStatements.length} failing (${JSON.stringify(counts)})`,
		);

		const failures: Failure[] = [];
		const bySignature = new Map<string, Failure>();
		let shrunkCount = 0;
		for (const { item, property, detail, ours: ev } of toShrink.values()) {
			let sql = item.sql;
			let sig = `${property}:${item.node ? kinds(item.node).join(",") : item.source}`;
			let lastDetail = detail;
			let lastOurs = ev;
			if (item.node && shrunkCount++ < o.shrink) {
				const details = await fc.check(
					fc.asyncProperty(arb, async (s) => {
						const c = await f.checkOne(s.sql);
						const hit = c.failures.find((x) => x.property === property);
						if (hit) {
							lastDetail = hit.detail;
							lastOurs = c.ours;
						}
						return !hit;
					}),
					{
						seed: o.seed,
						path: String(item.index),
						numRuns: item.index + 1,
						interruptAfterTimeLimit: 180_000,
					},
				);
				const shrunk = details.counterexample?.[0];
				if (shrunk) {
					sql = shrunk.sql;
					sig = `${property}:${kinds(shrunk).join(",")}`;
					const final = await f.checkOne(sql);
					const hit = final.failures.find((x) => x.property === property);
					if (hit) (lastDetail = hit.detail), (lastOurs = final.ours);
				}
			}
			const failure: Failure = {
				property,
				detail: lastDetail,
				signature: sig,
				sql,
				original: item.sql,
				ours: "text" in lastOurs ? lastOurs.text : lastOurs.error,
				source: item.source,
			};
			const prev = bySignature.get(sig);
			if (!prev || prev.sql.length > sql.length) bySignature.set(sig, failure);
			o.log(`fuzz: [${property}] ${sql.slice(0, 160)}`);
		}
		failures.push(...bySignature.values());

		const replayed: {
			sql: string;
			key: string;
			failing: boolean;
			detail: string;
		}[] = [];
		for (const r of o.replay) {
			const c = await f.checkOne(r.sql);
			replayed.push({
				sql: r.sql,
				key: r.key,
				failing: c.failures.length > 0,
				detail: c.failures.map((x) => `${x.property}: ${x.detail}`).join("; "),
			});
		}
		return {
			seed: o.seed,
			runs: o.runs,
			checked: items.length,
			failing: failingStatements.length,
			counts,
			nullRatio: { nulled, nullable },
			failures,
			failingStatements,
			replayed,
			ms: performance.now() - started,
		};
	} finally {
		await f.close();
	}
}
