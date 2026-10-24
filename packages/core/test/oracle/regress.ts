import { closeSync, createReadStream, existsSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { PROBE_HEAD, ProbeSession, parseTypeText, readAnalysis, type Evaluated } from "../../src/cache/evaluate.js";
import { scanNames } from "../../src/cache/scan.js";
// @ts-expect-error -- plain JavaScript (psql.mjs), typed by its JSDoc only
import { classify } from "../pg-regress/psql.mjs";
import { compareStatement, normalizeOurs, type Observed, type Ours, type Server } from "./compare.js";
import type { Disagreement } from "./kinds.js";
import { Connection, isRejection, type Ran, type ServerError } from "./replay.js";
import { NORM_PRELUDE, readDb, type Db } from "./schema.js";
import { hashOf } from "./baseline.js";
import { evaluateInBatches, orderDependent } from "./batches.js";
import { REGRESS_MOUNT, regressDir } from "./server.js";
import { count, emptyResult, record, type OracleResult, type Verdict } from "./result.js";
import { isCorePath, oursOf, withDatabase } from "./types.js";
import { compareView, viewable, viewableText, viewNotNull } from "./views.js";

/** packages/pg's introspection, loaded at run time: it is outside this package's sources. */
interface IntrospectedRelation {
  readonly schema: string;
  readonly name: string;
  readonly kind: string;
  readonly columns: readonly { readonly name: string; readonly type: string; readonly nullable: boolean; readonly hasDefault: boolean }[];
}
interface IntrospectedDatabase {
  readonly relations: readonly IntrospectedRelation[];
  readonly enums: readonly { readonly name: string; readonly values: readonly string[] }[];
}
type Introspect = (client: { query(text: string, values?: unknown[]): Promise<{ rows: readonly unknown[]; rowCount: number | null }> }, options: { schemas: readonly string[]; exclude: readonly string[] }) => Promise<IntrospectedDatabase>;
const introspectPath = join(import.meta.dirname, "../../../pg/src/introspect/index.ts");
let introspectFn: Promise<Introspect> | undefined;
const introspect: Introspect = async (client, options) => (await (introspectFn ??= import(/* @vite-ignore */ introspectPath).then((m: { introspect: Introspect }) => m.introspect)))(client, options);

interface Statement {
  sql: string;
  line: number;
  psqlVars: boolean;
  conditional: boolean;
  nonstandardStrings: boolean;
  pg?: "ok" | "error" | "syntax-error" | "unknown";
  pgError?: string;
  copyData?: string;
}

const DATABASE = "regression";
/** What pg_regress sets (pg_regress.c): the outcome of date and time statements depends on them. */
const SETTINGS = { TimeZone: "America/Los_Angeles", DateStyle: "Postgres, MDY", IntervalStyle: "postgres_verbose" };
/** psql's `\getenv` values for test_setup: the data files at the mount, regress.so where it is not. */
const ENV = { PG_ABS_SRCDIR: REGRESS_MOUNT, PG_LIBDIR: "/usr/lib/postgresql/18/lib", PG_DLSUFFIX: ".so" };
const BATCH = 1000;

export interface Shard {
  /** 1-based. */
  readonly index: number;
  readonly count: number;
}

/** Every shard still replays the schedule up to its last test, unchecked, so the database is in the state its tests expect. */
export function checkedTests(tests: readonly string[], shard: Shard | undefined): string[] {
  if (!shard || shard.count <= 1) return [...tests];
  const weight = (t: string): number => (readFileSync(join(regressDir, "sql", `${t}.sql`), "utf8").match(/;/g) ?? []).length + 1;
  const sets = Array.from({ length: shard.count }, () => ({ weight: 0, tests: [] as string[] }));
  for (const t of [...tests].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b))) {
    const lightest = sets.reduce((a, b) => (b.weight < a.weight ? b : a));
    lightest.tests.push(t);
    lightest.weight += weight(t);
  }
  const set = new Set(sets[shard.index - 1]!.tests);
  return tests.filter((t) => set.has(t));
}

export function schedule(): string[] {
  const text = readFileSync(join(regressDir, "parallel_schedule"), "utf8");
  return text.split("\n").flatMap((l) => (/^test:\s*/.test(l) ? l.replace(/^test:\s*/, "").trim().split(/\s+/) : []));
}

type Kind = { readonly t: "query"; readonly text: string } | { readonly t: "ddl" } | { readonly t: "other" };

export function kindOf(sql: string): Kind {
  const s = sql.replace(/^(\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "").replace(/;\s*$/, "");
  const declare = /^declare\s+(?:"[^"]+"|\S+)\s+(?:(?:binary|asensitive|insensitive|no\s+scroll|scroll)\s+)*cursor\s+(?:(?:with|without)\s+hold\s+)?for\s+([\s\S]*)$/i.exec(s);
  if (declare) return { t: "query", text: declare[1]! };
  const prepare = /^prepare\s+(?:"[^"]+"|[^\s(]+)\s*(?:\(([^)]*)\))?\s*as\s+([\s\S]*)$/i.exec(s);
  if (prepare) return { t: "query", text: typedParams(prepare[2]!, splitTypes(prepare[1] ?? "")) };
  if (/^select\b/i.test(s) && /\binto\s+(?:(?:temp|temporary|unlogged)\s+)?(?:table\s+)?[\w"]+\s+from\b/i.test(s.split(/\bfrom\b/i)[0] + " from")) return { t: "ddl" };
  if (/^(\(\s*)*(select|values|table|with|insert|update|delete|merge)\b/i.test(s)) return { t: "query", text: s };
  if (/^(create|alter|drop|comment)\b/i.test(s)) return { t: "ddl" };
  return { t: "other" };
}

function splitTypes(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of list) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) (out.push(cur.trim()), (cur = ""));
    else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function typedParams(body: string, types: readonly string[]): string {
  if (!types.length) return body;
  let out = "";
  for (let i = 0; i < body.length; ) {
    const c = body[i]!;
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < body.length && !(body[j] === c && body[j + 1] !== c)) j += body[j] === c ? 2 : 1;
      out += body.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    const m = /^\$(\d+)/.exec(body.slice(i));
    if (m && !/[\w$]/.test(body[i - 1] ?? "")) {
      const t = types[Number(m[1]) - 1];
      out += t ? `(${m[0]}::${t})` : m[0];
      i += m[0].length;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

interface State {
  readonly key: string;
  readonly path: readonly string[];
  readonly temp: string | null;
}

async function stateOf(conn: Connection): Promise<State> {
  const [r] = await conn.sql.unsafe<{ f: string; path: string[]; temp: string | null }[]>(
    `SELECT md5(concat_ws('|',
              (SELECT string_agg(xmin::text || ':' || oid::text, ',' ORDER BY oid) FROM pg_class),
              (SELECT string_agg(xmin::text, ',' ORDER BY attrelid, attnum) FROM pg_attribute WHERE attrelid >= 16384),
              (SELECT string_agg(xmin::text || ':' || oid::text, ',' ORDER BY oid) FROM pg_type),
              (SELECT string_agg(xmin::text || ':' || oid::text, ',' ORDER BY oid) FROM pg_namespace),
              (SELECT string_agg(xmin::text || ':' || oid::text, ',' ORDER BY oid) FROM pg_proc WHERE oid >= 16384))) AS f,
            current_schemas(false)::text[] AS path,
            CASE WHEN pg_my_temp_schema() <> 0 THEN pg_my_temp_schema()::regnamespace::text END AS temp`,
  );
  return { key: `${r!.f}|${r!.path.join(",")}|${r!.temp}`, path: r!.path, temp: r!.temp };
}

class Snapshots {
  private readonly cache = new Map<string, string>();
  private readonly conn: Connection;
  constructor(conn: Connection) {
    this.conn = conn;
  }

  skipped: string[] = [];
  shadowed: string[] = [];
  private readonly skippedBy = new Map<string, { skipped: string[]; shadowed: string[] }>();

  async db(state: State, words: ReadonlySet<string>): Promise<string> {
    const names = [...words].sort();
    const key = `${state.key}|${names.join(",")}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) {
      ({ skipped: this.skipped, shadowed: this.shadowed } = this.skippedBy.get(key) ?? { skipped: [], shadowed: [] });
      return hit;
    }
    this.skipped = [];
    this.shadowed = [];
    const text = await this.build(state, words);
    if (this.cache.size > 5000) (this.cache.clear(), this.skippedBy.clear());
    this.cache.set(key, text);
    this.skippedBy.set(key, { skipped: this.skipped, shadowed: this.shadowed });
    return text;
  }

  private async build(state: State, words: ReadonlySet<string>): Promise<string> {
    const conn = this.conn;
    const schemaRows = await conn.sql.unsafe<{ name: string }[]>(
      `SELECT nspname::text AS name FROM pg_namespace WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND nspname NOT LIKE 'pg\\_%' ORDER BY nspname`,
    );
    const schemas = [...(state.temp ? [state.temp] : []), ...schemaRows.map((r) => r.name)];
    const rels = await conn.sql.unsafe<{ schema: string; name: string }[]>(
      `SELECT n.nspname::text AS schema, c.relname::text AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND n.nspname = ANY($1::text[])`,
      [schemas],
    );
    const exclude = rels.filter((r) => !words.has(r.name)).map((r) => `${r.schema}.${r.name}`.replace(/\*/g, "?"));
    const wanted = rels.length - exclude.length;
    const db: IntrospectedDatabase = wanted
      ? await introspect({ query: async (text, values) => {
          const rows = await conn.sql.unsafe(text, (values ?? []) as never[]);
          return { rows, rowCount: rows.count };
        } }, { schemas, exclude })
      : { relations: [], enums: [] };
    const functions = await this.functions(words);
    const along = [...(state.temp ? [state.temp] : []), ...state.path];
    const counts = new Map<string, number>();
    for (const r of db.relations) if (along.includes(r.schema)) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
    this.shadowed = [...counts].filter(([, n]) => n > 1).map(([name]) => name);
    return dbText(db, state, functions);
  }

  /** Nullable: their results are not ours to judge. */
  private async functions(words: ReadonlySet<string>): Promise<string> {
    const rows = await this.conn.sql.unsafe<{ name: string; kind: string; srf: boolean; ret: number; args: number[]; defaults: number }[]>(
      `SELECT p.proname::text AS name, p.prokind::text AS kind, p.proretset AS srf, p.prorettype::int4 AS ret,
              p.proargtypes::oid[]::int4[] AS args, p.pronargdefaults::int4 AS defaults
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = ANY($1::text[]) AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY p.proname, p.oid`,
      [[...words]],
    );
    const sigs = new Map<string, string[]>();
    for (const r of rows) {
      const ret = await this.conn.typeName(r.ret);
      const args = await Promise.all(r.args.map((a) => this.conn.typeName(a)));
      if ([ret, ...args].some((t) => PSEUDO.has(t.replace(/\[\]$/, "")) && t !== "void")) {
        this.skipped.push(r.name);
        continue;
      }
      const flags = [r.srf ? "srf: true" : "", r.kind === "a" ? "agg: true" : "", r.kind === "w" ? "window: true" : "", "nullable: true"].filter(Boolean).join("; ");
      for (let n = args.length - r.defaults; n <= args.length; n++) {
        (sigs.get(r.name) ?? sigs.set(r.name, []).get(r.name)!).push(`__T.Sig<[${args.slice(0, n).map((a) => JSON.stringify(a)).join(", ")}], ${JSON.stringify(ret)}, { ${flags} }>`);
      }
    }
    return [...sigs].map(([name, list]) => `${JSON.stringify(name)}: ${list.length === 1 ? list[0] : `[${list.join(", ")}]`}`).join("; ");
  }
}

const PSEUDO = new Set(["any", "anyelement", "anyarray", "anynonarray", "anyenum", "anyrange", "anymultirange", "anycompatible", "anycompatiblearray", "anycompatiblenonarray", "anycompatiblerange", "anycompatiblemultirange", "record", "trigger", "event_trigger", "internal", "cstring", "language_handler", "fdw_handler", "table_am_handler", "index_am_handler", "tsm_handler", "opaque", "unknown"]);

function dbText(db: IntrospectedDatabase, state: State, functions: string): string {
  const order = [...(state.temp ? [state.temp] : []), ...state.path];
  const top = new Map<string, IntrospectedRelation>();
  for (const s of order) for (const r of db.relations) if (r.schema === s && !top.has(r.name)) top.set(r.name, r);
  const nested = new Map<string, IntrospectedRelation[]>();
  for (const r of db.relations) {
    if (r.schema === "public" || r.schema === state.temp) continue;
    (nested.get(r.schema) ?? nested.set(r.schema, []).get(r.schema)!).push(r);
  }
  const rel = (r: IntrospectedRelation): string => {
    const cols = r.columns.map((c) => `${JSON.stringify(c.name)}: __c<${JSON.stringify(c.type)}, ${c.nullable}, ${c.hasDefault}>`).join("; ");
    return r.kind === "view" || r.kind === "materialized view" ? `__T.View<{ ${cols} }>` : `{ ${cols} }`;
  };
  const parts: string[] = [];
  for (const [name, r] of top) parts.push(`${JSON.stringify(name)}: ${rel(r)}`);
  for (const [schema, rs] of nested) if (!top.has(schema)) parts.push(`${JSON.stringify(schema)}: { ${rs.map((r) => `${JSON.stringify(r.name)}: ${rel(r)}`).join("; ")} }`);
  if (db.enums.length) parts.push(`$types: { ${db.enums.map((e) => `${JSON.stringify(e.name)}: ${e.values.length ? e.values.map((v) => JSON.stringify(v)).join(" | ") : "never"}`).join("; ")} }`);
  if (functions) parts.push(`$functions: { ${functions} }`);
  return `{ ${parts.join("; ")} } & __T.PgCatalog`;
}

const PRELUDE = `${NORM_PRELUDE}type __c<T extends string, N extends boolean, D extends boolean> = { readonly type: T; readonly nullable: N; readonly hasDefault: D };
type __Applied<R> = R extends __T.SqlError<infer M, infer _P> ? ["error", M] : ["ok", NormDb<R>];
type __Chain<D, Q extends string> = __T.ApplyDdl<D, Q> extends infer R ? (R extends __T.SqlError<infer _M, infer _P> ? D : R) : D;
type __PickNs<N, W> = N extends unknown ? { [K in keyof N as K extends W ? K : never]: N[K] } : never;
type __Pick<D, W> = D extends unknown ? { [K in keyof D as K extends W | "$types" ? K : never]: K extends "$types" ? D[K] : __IsRel<D[K]> extends true ? D[K] : __PickNs<D[K], W> } : never;
type __AppliedPick<R, W> = R extends __T.SqlError<infer M, infer _P> ? ["error", M] : ["ok", NormDb<__Pick<R, W>>];
type __Noop<Q extends string> = __T.Lex<Q> extends infer T extends __T.Toks ? (__T.ParseProgram<T> extends { readonly t: "noop" } ? "noop" : "applied") : "applied";
`;

interface Checked {
  readonly test: string;
  readonly line: number;
  readonly text: string;
  readonly db: string;
  readonly ddl: boolean;
  readonly chain?: { readonly id: string; readonly prev: number };
  readonly describe?: Observed["columns"] extends infer C ? { readonly columns: C; readonly params: readonly string[] } | { readonly error: ServerError } : never;
  /** The checked text is the statement that ran (not a DECLARE's query or a PREPARE's body): its rows count. */
  readonly ran?: boolean;
  readonly unrepresentable?: readonly string[];
  readonly after?: string;
  readonly pathSchemas?: readonly string[];
  /** 4d: names one relation hides another of (a temp table over a public one): a `DB` cannot say that. */
  readonly shadowed?: readonly string[];
  readonly live: Ran;
  result?: Evaluated;
  afterResult?: Evaluated;
  noop?: Evaluated;
}

interface Chain {
  readonly s0: string;
  readonly steps: string[];
}

interface ReplayCache {
  readonly key: string;
  readonly checked: Checked[];
  readonly chains: { [id: string]: Chain };
  readonly viewed: [number, boolean[] | null][];
  readonly regress: OracleResult["tally"];
  readonly ddl: OracleResult["tally"];
}

export interface RegressResults {
  readonly regress: OracleResult;
  readonly ddl: OracleResult;
  readonly views: OracleResult;
}

export async function regressOracle(url: string, only: readonly string[], log: (m: string) => void, options: { readonly views?: boolean; readonly shard?: Shard } = {}): Promise<RegressResults> {
  const started = performance.now();
  const all = schedule();
  const unknown = only.filter((t) => !all.includes(t));
  if (unknown.length) throw new Error(`not in parallel_schedule: ${unknown.join(", ")}`);
  const mine = checkedTests(only.length ? only : all, options.shard);
  const last = Math.max(...mine.map((t) => all.indexOf(t)));
  const tests = all.slice(0, last + 1);
  const checking = (t: string): boolean => mine.includes(t);
  if (options.shard) log(`regress oracle: shard ${options.shard.index}/${options.shard.count} checks ${mine.length} tests`);

  const regress = emptyResult();
  const ddl = emptyResult();
  const views = emptyResult();
  const viewed = new Map<Checked, boolean[] | null>();
  /** Restarted after a ROLLBACK: the server dropped the steps. */
  const chains: { [id: string]: Chain } = {};

  const checked: Checked[] = [];
  const cachePath = process.env["TYPESQL_ORACLE_REPLAY_CACHE"];
  const cacheKey = JSON.stringify({ tests, only, views: options.views ?? false });
  const cached = cachePath && existsSync(cachePath) ? (JSON.parse(readFileSync(cachePath, "utf8")) as ReplayCache) : null;
  if (cached?.key === cacheKey) {
    checked.push(...cached.checked);
    for (const [i, nn] of cached.viewed) viewed.set(checked[i]!, nn);
    Object.assign(regress.tally, cached.regress);
    Object.assign(ddl.tally, cached.ddl);
    Object.assign(chains, cached.chains);
    log(`regress oracle: the replay from ${cachePath}`);
  } else {
    const admin = new Connection(url);
    try {
      await admin.exec(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
      await cleanGlobals(admin);
      await admin.exec(`CREATE DATABASE ${DATABASE} TEMPLATE template0`);
      for (const [k, v] of Object.entries({ lc_messages: "C", lc_monetary: "C", lc_numeric: "C", lc_time: "C", bytea_output: "hex", timezone_abbreviations: "Default" })) {
        await admin.exec(`ALTER DATABASE ${DATABASE} SET ${k} TO '${v}'`);
      }
    } finally {
      await admin.close();
    }

    const dbUrl = withDatabase(url, DATABASE);
    for (const test of tests) {
      const sql = readFileSync(join(regressDir, "sql", `${test}.sql`), "utf8");
      const out = readFileSync(join(regressDir, "expected", `${test}.out`), "utf8");
      const stmts = classify(sql, out, { env: ENV }) as Statement[];
      const ddlWords = new Set(stmts.flatMap((st) => (kindOf(st.sql).t === "ddl" ? [...scanWords(st.sql)] : [])));
      let chain: { id: string; chain: Chain } | null = null;
      let chains_ = 0;
      const conn = new Connection(dbUrl, { statementTimeoutMs: 120_000, settings: SETTINGS });
      const snapshots = new Snapshots(conn);
      let state: State | null = null;
      const look = async (): Promise<State> => (state ??= await stateOf(conn));
      if (process.env["TYPESQL_ORACLE_DEBUG"]) log(`regress oracle: replaying ${test}`);
      try {
        for (const [at, s] of stmts.entries()) {
          // a statement the client never finishes (the server waits for it) aborts the file
          let timer: NodeJS.Timeout | undefined;
          const aborted = await Promise.race([
            step(s).then(() => false),
            new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(true), 300_000))),
          ]).finally(() => clearTimeout(timer));
          if (aborted) {
            regress.notes.push(`${test}: the replay stopped at line ${s.line} (no answer in 300 s)`);
            if (checking(test)) count(regress, "skip: replay-aborted", stmts.length - at);
            break;
          }
        }
      } finally {
        await conn.close().catch(() => undefined);
      }

      async function step(s: Statement): Promise<void> {
        if (s.psqlVars || s.conditional) {
          if (checking(test)) count(regress, "skip: psql-variable");
          return;
        }
        // sent, not checked: our parser follows standard_conforming_strings' default
        const mine = checking(test) && !s.nonstandardStrings;
        if (checking(test) && s.nonstandardStrings) count(regress, "skip: nonstandard-strings");
        const kind = kindOf(s.sql);
        let before: { state: State; db: string; skipped: readonly string[]; shadowed: readonly string[] } | null = null;
        let describe: Checked["describe"];
        const words = kind.t === "other" ? null : scanWords(kind.t === "query" ? kind.text : s.sql);
        if (mine && words) {
          // the catalog cannot be read in a transaction the test left aborted
          try {
            const st = await look();
            before = { state: st, db: await snapshots.db(st, words), skipped: snapshots.skipped, shadowed: snapshots.shadowed };
            if (kind.t === "query") {
              const d = await conn.describe(kind.text);
              describe = "error" in d ? d : {
                columns: await Promise.all(d.columns.map(async (c) => ({ name: c.name, type: await conn.typeName(c.type) }))),
                params: await Promise.all(d.params.map((p) => conn.typeName(p))),
              };
            }
          } catch {
            before = null;
            state = null;
            count(kind.t === "ddl" ? ddl : regress, "skip: aborted-transaction");
          }
        }
        const notNull = options.views && kind.t === "query" && describe && !("error" in describe) && !describe.params.length && viewableText(kind.text) ? await viewNotNull(conn, kind.text) : undefined;
        if (mine && kind.t === "ddl" && before && !chain) {
          try {
            const id = `${test}#${chains_++}`;
            chain = { id, chain: { s0: await snapshots.db(before.state, ddlWords), steps: [] } };
            chains[id] = chain.chain;
          } catch {
            chain = null;
          }
        }
        const inChain = kind.t === "ddl" && chain ? { id: chain.id, prev: chain.chain.steps.length } : undefined;
        // only whether a value is NULL matters (and NaN would not survive the replay cache's JSON)
        const live = nullsOnly(await conn.runScript(s.sql, s.copyData));
        if (kind.t !== "query") state = null;
        if (chain && kind.t === "ddl" && !("error" in live)) chain.chain.steps.push(s.sql.replace(/;\s*$/, ""));
        if (/^\s*(rollback|abort)\b/i.test(s.sql)) chain = null;
        if (!mine || !before || !words) return;
        const expected = s.pg === "syntax-error" ? "error" : s.pg;
        const outcome = "error" in live ? "error" : "ok";
        if (expected === "unknown" || expected === undefined) {
          count(kind.t === "ddl" ? ddl : regress, "skip: outcome-unknown");
          return;
        }
        if (expected !== outcome) {
          count(kind.t === "ddl" ? ddl : regress, "skip: replay-diverged");
          return;
        }
        if (kind.t === "query") {
          const c: Checked = { test, line: s.line, text: kind.text, db: before.db, ddl: false, describe: describe!, ran: kind.text === s.sql.replace(/;\s*$/, "").trim(), live, ...(before.skipped.length ? { unrepresentable: before.skipped } : {}) };
          checked.push(c);
          if (notNull !== undefined) viewed.set(c, notNull);
        }
        else {
          let after: string | undefined;
          let afterState: State | undefined;
          try {
            afterState = await look();
            after = "error" in live ? undefined : await snapshots.db(afterState, words);
          } catch {
            state = null;
            count(ddl, "skip: aborted-transaction");
            return;
          }
          const shadowed = [...new Set([...before.shadowed, ...(after !== undefined ? snapshots.shadowed : [])])];
          const pathSchemas = [...new Set([...before.state.path, ...(afterState?.path ?? [])])].filter((p) => p !== "public");
          checked.push({ test, line: s.line, text: s.sql.replace(/;\s*$/, ""), db: before.db, ddl: true, live, ...(after !== undefined ? { after } : {}), ...(pathSchemas.length ? { pathSchemas } : {}), ...(shadowed.length ? { shadowed } : {}), ...(inChain ? { chain: inChain } : {}) });
        }
      }
    }
    if (cachePath) {
      const index = new Map(checked.map((c, i) => [c, i]));
      const data: ReplayCache = { key: cacheKey, checked, chains, viewed: [...viewed].map(([c, nn]) => [index.get(c)!, nn]), regress: regress.tally, ddl: ddl.tally };
      writeFileSync(cachePath, JSON.stringify(data));
    }
  }
  log(`regress oracle: replayed ${tests.length} tests in ${((performance.now() - started) / 1000).toFixed(0)} s; ${checked.filter((c) => !c.ddl).length} queries and ${checked.filter((c) => c.ddl).length} DDL steps to check`);

  const session = new ProbeSession(join(import.meta.dirname, "tsconfig.regress.json"), join(import.meta.dirname, ".probe/__regress_probe__.ts"));
  const t0 = performance.now();
  const alias = (db: string): string => `D_${hashOf(db)}`;
  const chainAlias = (id: string, k: number): string => `C_${hashOf(id)}_${k}`;
  const exprs: string[] = [];
  const dbsOf: string[][] = [];
  const chainOf: ({ id: string; upTo: number } | null)[] = [];
  /** Files never share a program, so a shard's results are the full run's. */
  const fileOf: string[] = [];
  for (const c of checked) {
    const before = exprs.length;
    if (!c.ddl) {
      exprs.push(`__T.CacheAnalysis<${alias(c.db)}, ${JSON.stringify(c.text)}>`);
      dbsOf.push([c.db]);
      chainOf.push(null);
    } else {
      const words = [...scanWords(c.text)].map((w) => JSON.stringify(w)).join(" | ") || "never";
      if (c.chain && chains[c.chain.id]) {
        exprs.push(`__AppliedPick<__T.ApplyDdl<${chainAlias(c.chain.id, c.chain.prev)}, ${JSON.stringify(c.text)}>, ${words}>`);
        dbsOf.push([]);
        chainOf.push({ id: c.chain.id, upTo: c.chain.prev });
      } else {
        exprs.push(`__AppliedPick<__T.ApplyDdl<${alias(c.db)}, ${JSON.stringify(c.text)}>, ${words}>`);
        dbsOf.push([c.db]);
        chainOf.push(null);
      }
      exprs.push(c.after !== undefined ? `NormDb<${alias(c.after)}>` : "0");
      dbsOf.push(c.after !== undefined ? [c.after] : []);
      chainOf.push(null);
      exprs.push(`__Noop<${JSON.stringify(c.text)}>`);
      dbsOf.push([]);
      chainOf.push(null);
    }
    for (let k = before; k < exprs.length; k++) fileOf.push(c.test);
  }
  const base = (indices: readonly number[]): string => {
    let text = PROBE_HEAD + PRELUDE;
    const seen = new Set<string>();
    for (const i of indices) for (const db of dbsOf[i]!) if (!seen.has(db)) (seen.add(db), (text += `type ${alias(db)} = ${db};\n`));
    const upTo = new Map<string, number>();
    for (const i of indices) {
      const ch = chainOf[i];
      if (ch) upTo.set(ch.id, Math.max(upTo.get(ch.id) ?? 0, ch.upTo));
    }
    for (const [id, k] of upTo) {
      const ch = chains[id]!;
      text += `type ${chainAlias(id, 0)} = ${ch.s0};\n`;
      for (let j = 1; j <= k; j++) text += `type ${chainAlias(id, j)} = __Chain<${chainAlias(id, j - 1)}, ${JSON.stringify(ch.steps[j - 1])}>;\n`;
    }
    return text;
  };
  const evalKey = hashOf(`${readFileSync(join(import.meta.dirname, "../../src/engine/cache.ts"), "utf8").match(/CacheVersion = "[^"]*"/)?.[0]}\0${exprs.join("\0")}`);
  const evalCache = cachePath ? `${cachePath}.eval.json` : null;
  const cachedResults = evalCache && existsSync(evalCache) ? await readJsonLines(evalCache) : null;
  let results: Evaluated[];
  if (cachedResults?.[0] === evalKey) results = cachedResults.slice(1) as Evaluated[];
  else try {
    results = await evaluateInBatches(session, base, exprs, isCorePath, { size: BATCH, timeoutMs: 300_000, isolate: orderDependent, group: (i) => fileOf[i]!, log: (m) => log(`regress oracle: ${m} (${((performance.now() - t0) / 1000).toFixed(0)} s)`) });
    if (evalCache) writeJsonLines(evalCache, [evalKey, ...results]);
  } finally {
    await session.dispose().catch(() => undefined);
  }
  let k = 0;
  for (const c of checked) {
    c.result = results[k++]!;
    if (c.ddl) {
      c.afterResult = results[k++]!;
      c.noop = results[k++]!;
    }
  }

  const causes = new Map<string, number>();
  for (const c of checked) {
    const target = c.ddl ? ddl : regress;
    const v = c.ddl ? compareDdl(c) : compareQuery(c);
    if (!c.ddl && "disagreements" in v) {
      const r = v.disagreements.find((d) => d.kind === "rejects");
      if (r) causes.set(causeOf(r.detail), (causes.get(causeOf(r.detail)) ?? 0) + 1);
    }
    record(target, c.test, c.text, v, { line: c.line }, c.result);
    if (viewed.has(c)) {
      const ours = oursOf(c);
      if ("analysis" in ours && viewable(c.text, ours.analysis)) {
        const vv = compareView(c.text, ours.analysis, viewed.get(c)!);
        if ("narrowed" in vv && vv.narrowed) count(views, "narrowed columns", vv.narrowed);
        record(views, c.test, c.text, vv, { line: c.line }, c.result);
      }
    }
  }
  regress.notes.push(`rejects by cause: ${[...causes].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  log(`regress oracle: done in ${((performance.now() - started) / 1000).toFixed(0)} s`);
  return { regress, ddl, views };
}

function nullsOnly(r: Ran): Ran {
  return "rows" in r ? { rows: r.rows.map((row) => row.map((v) => (v === null ? null : 1))), count: r.count } : r;
}

/** One JSON value per line: a single JSON text of all of them can exceed V8's string length. */
function writeJsonLines(path: string, values: readonly unknown[]): void {
  const fd = openSync(path, "w");
  try {
    for (const v of values) writeSync(fd, `${JSON.stringify(v)}\n`);
  } finally {
    closeSync(fd);
  }
}

async function readJsonLines(path: string): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) if (line) out.push(JSON.parse(line));
  return out;
}

function scanWords(text: string): Set<string> {
  const n = scanNames(text);
  const words = new Set(n.words);
  for (const p of n.pairs) for (const w of p.split(".")) words.add(w);
  return words;
}

/** Roles, tablespaces and databases a previous replay left behind (they outlive the database). */
async function cleanGlobals(admin: Connection): Promise<void> {
  for (const { name } of await admin.sql.unsafe<{ name: string }[]>(`SELECT datname::text AS name FROM pg_database WHERE datname LIKE 'regression%' OR datname LIKE 'regress\\_%'`)) {
    await admin.tryExec(`DROP DATABASE IF EXISTS ${JSON.stringify(name)} WITH (FORCE)`);
  }
  for (const { name } of await admin.sql.unsafe<{ name: string }[]>(`SELECT spcname::text AS name FROM pg_tablespace WHERE spcname LIKE 'regress%'`)) {
    await admin.tryExec(`DROP TABLESPACE IF EXISTS ${JSON.stringify(name)}`);
  }
  for (const { name } of await admin.sql.unsafe<{ name: string }[]>(`SELECT rolname::text AS name FROM pg_roles WHERE rolname LIKE 'regress%' OR rolname LIKE 'regtest%'`)) {
    await admin.tryExec(`DROP OWNED BY ${JSON.stringify(name)} CASCADE`);
    await admin.tryExec(`DROP ROLE IF EXISTS ${JSON.stringify(name)}`);
  }
}


function compareQuery(c: Checked): Verdict {
  const d = c.describe!;
  let server: Server;
  if ("error" in d) server = { error: d.error };
  else {
    const live = c.live;
    const observed: Observed = {
      columns: d.columns,
      params: d.params,
      rows: c.ran && "rows" in live ? live.rows : [],
      runs: 1,
      runErrors: "error" in live ? [live.error] : [],
    };
    server = { observed };
  }
  const v = compareStatement(oursOf(c), server);
  if ("disagreements" in v && c.unrepresentable?.length) {
    const fn = v.disagreements.map((d) => /^ours: function (?:[\w$]+\.)?([\w$]+)\(/.exec(d.detail)?.[1]).find((f) => f !== undefined);
    if (fn && c.unrepresentable.includes(fn)) return { skip: "schema-unrepresentable" };
  }
  return v;
}

function compareDdl(c: Checked): Verdict {
  // a statement our parser skips without validating it: ApplyDdl neither accepts nor applies it
  if (c.noop && "text" in c.noop && c.noop.text === '"noop"') return { skip: "not-applied" };
  const r = c.result;
  if (!r) return { disagreements: [{ kind: "crash", detail: "not evaluated" }] };
  if ("error" in r) return { disagreements: [{ kind: "crash", detail: r.error }] };
  const v = parseTypeText(r.text);
  const ourError = Array.isArray(v) && v[0] === "error" ? String(v[1]) : null;
  const serverError = "error" in c.live ? c.live.error : null;
  if (ourError !== null && serverError) return { disagreements: [] };
  if (ourError !== null) return { disagreements: [{ kind: "rejects", detail: `ours: ${ourError}` }] };
  if (serverError) return isRejection(serverError) ? { disagreements: [{ kind: "accepts", detail: `server: ${serverError.code} ${serverError.message}` }] } : { skip: "server-error" };
  const after = c.afterResult;
  if (!after || "error" in after || !Array.isArray(v)) return { disagreements: [{ kind: "crash", detail: after && "error" in after ? after.error : "no result" }] };
  let ours: Db;
  let theirs: Db;
  try {
    ours = readDb(v[1] as never);
    theirs = readDb(parseTypeText(after.text));
  } catch (e) {
    if (process.env["TYPESQL_ORACLE_DEBUG"]) console.log("UNREADABLE", JSON.stringify({ text: c.text, ours: r.text.slice(0, 300), error: (e as Error).message }));
    return { skip: "unreadable-result" };
  }
  const words = scanWords(c.text);
  if (c.shadowed?.some((n) => words.has(n))) return { skip: "schema-unrepresentable" };
  return { disagreements: diffDbs(ours, theirs, words, new Set(c.pathSchemas ?? [])) };
}

export function diffDbs(ours: Db, theirs: Db, words: ReadonlySet<string>, pathSchemas: ReadonlySet<string> = new Set()): Disagreement[] {
  const out: Disagreement[] = [];
  const key = (r: { schema: string | null; name: string }): string => `${r.schema ?? "public"}.${r.name}`;
  // a schema on the search path has its relations at the top level too: compare those
  const compared = (r: { schema: string | null; name: string }): boolean => words.has(r.name) && !(r.schema !== null && pathSchemas.has(r.schema));
  const mine = new Map(ours.relations.filter(compared).map((r) => [key(r), r]));
  const real = new Map(theirs.relations.filter(compared).map((r) => [key(r), r]));
  for (const [k, r] of real) {
    const o = mine.get(k);
    if (!o) {
      out.push({ kind: "unsound", detail: `${k}: missing in ours` });
      continue;
    }
    if (o.view !== r.view) out.push({ kind: "unsound", detail: `${k}: ${o.view ? "view" : "table"} in ours, ${r.view ? "view" : "table"} on the server` });
    // by name: an object type has no column order
    const names = (x: typeof r): string => x.columns.map((c) => c.name).sort().join(", ");
    if (names(o) !== names(r)) {
      out.push({ kind: "unsound", detail: `${k}: columns (${names(o)}), server (${names(r)})` });
      continue;
    }
    r.columns.forEach((c) => {
      const oc = o.columns.find((x) => x.name === c.name)!;
      if (normalizeOurs(oc.type) !== normalizeOurs(c.type)) out.push({ kind: "unsound", detail: `${k}.${c.name}: type ${oc.type}, server ${c.type}` });
      // a view's NOT NULL on the server side is packages/pg's view analysis, which does not narrow: a candidate only
      if (!oc.nullable && c.nullable) out.push({ kind: r.view ? "unsound-candidate" : "unsound", detail: `${k}.${c.name}: NOT NULL in ours only` });
      if (oc.nullable && !c.nullable) out.push({ kind: "imprecise", detail: `${k}.${c.name}: NOT NULL on the server only` });
      if (!r.view && oc.hasDefault && !c.hasDefault) out.push({ kind: "unsound", detail: `${k}.${c.name}: a default in ours only` });
      if (!r.view && !oc.hasDefault && c.hasDefault) out.push({ kind: "imprecise", detail: `${k}.${c.name}: a default on the server only` });
    });
  }
  for (const k of mine.keys()) if (!real.has(k)) out.push({ kind: "unsound", detail: `${k}: not on the server` });
  return out;
}

export function causeOf(detail: string): string {
  const m = detail.replace(/^ours: /, "");
  if (/^function .* does not exist/.test(m)) return "unknown function";
  if (/^type .* does not exist|unknown type/.test(m)) return "unknown type";
  if (/^operator .* does not exist/.test(m)) return "unknown operator";
  if (/^relation .* does not exist/.test(m)) return "unknown relation";
  if (/^column .* does not exist/.test(m)) return "unknown column";
  if (/^syntax error/.test(m)) return "syntax";
  if (/not supported/.test(m)) return "unsupported";
  return "other";
}
