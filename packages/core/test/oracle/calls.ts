import { parseTypeText, type Evaluated, type TypeValue } from "../../src/cache/evaluate.js";
import { sampleTexts } from "./schema.js";

export interface Proc {
  readonly schema: string;
  readonly name: string;
  readonly args: readonly string[];
  readonly defaults: number;
  readonly variadic: string | null;
  readonly kind: string;
  readonly aggkind: string | null;
  readonly direct: number;
  readonly retset: boolean;
  readonly strict: boolean;
  readonly volatile: string;
  readonly ret: string;
  readonly outCols: boolean;
}

export interface OurSig {
  readonly args: readonly string[];
  readonly ret: string;
  readonly strict: boolean | readonly number[] | "-";
  readonly nullable: boolean | "-";
  readonly agg: boolean;
  readonly window: boolean;
  readonly srf: boolean;
}

export const procId = (p: { readonly name: string; readonly args: readonly string[] }): string => `${p.name}(${p.args.join(", ")})`;

export interface Inst {
  readonly elem: string;
  readonly range: string | null;
  readonly multirange: string | null;
}
export const INSTS: readonly Inst[] = [
  { elem: "int4", range: "int4range", multirange: "int4multirange" },
  { elem: "text", range: null, multirange: null },
  { elem: "jsonb", range: null, multirange: null },
];

export const ENUM = { name: "mood", labels: ["happy", "sad"] } as const;

const ELEMENT = new Set(["any", "anyelement", "anynonarray", "anycompatible", "anycompatiblenonarray"]);
const ARRAY = new Set(["anyarray", "anycompatiblearray"]);
const RANGE = new Set(["anyrange", "anycompatiblerange"]);
const MULTIRANGE = new Set(["anymultirange", "anycompatiblemultirange"]);

export const isPolymorphic = (t: string): boolean => ELEMENT.has(t) || ARRAY.has(t) || RANGE.has(t) || MULTIRANGE.has(t);

export function unusable(t: string): string | null {
  if (isPolymorphic(t) || t === "anyenum" || t === "record") return null;
  if (/^(internal|cstring|trigger|event_trigger|language_handler|fdw_handler|index_am_handler|table_am_handler|tsm_handler|void|unknown|opaque|pg_ddl_command|anycompatiblenonarray)$/.test(t)) return `pseudo-type ${t}`;
  return null;
}

export function instantiate(t: string, inst: Inst): string | null {
  if (ELEMENT.has(t)) return inst.elem;
  if (ARRAY.has(t)) return `${inst.elem}[]`;
  if (RANGE.has(t)) return inst.range;
  if (MULTIRANGE.has(t)) return inst.multirange;
  if (t === "anyenum") return ENUM.name;
  return t;
}

const MORE_SAMPLES: { readonly [t: string]: readonly string[] } = {
  [ENUM.name]: ENUM.labels,
  regconfig: ["english", "simple"],
  regdictionary: ["simple"],
  regnamespace: ["pg_catalog"],
  regrole: ["postgres"],
  regoperator: ["+(int4,int4)"],
  regprocedure: ["now()"],
  regcollation: ['"C"'],
  regoper: ["||/"],
  tid: ["(0,1)"],
  xid8: ["1"],
  cid: ["0"],
  aclitem: ["postgres=r/postgres"],
  pg_snapshot: ["10:20:10,14,15"],
  txid_snapshot: ["10:20:10,14,15"],
  int2vector: ["1 2"],
  oidvector: ["1 2"],
  refcursor: ["c"],
  char: ["a"],
  bit: ["1", "0"],
  // small values only: an argument is often a count or a length
  int2: ["0", "1"],
  int4: ["0", "1"],
  int8: ["0", "1"],
};

export function samplesOf(type: string): readonly string[] {
  if (type.endsWith("[]")) {
    const elem = samplesOf(type.slice(0, -2));
    if (!elem.length) return ["{}"];
    const q = (s: string): string => `"${s.replace(/["\\]/g, (c) => `\\${c}`)}"`;
    return ["{}", `{${elem.slice(0, 2).map(q).join(",")}}`];
  }
  return (MORE_SAMPLES[type] ?? sampleTexts(type)).slice(0, 2);
}

/** `"char"` is the one-byte type; `char` alone is `bpchar`. */
export function typeSql(t: string): string {
  const m = /^(.*?)((\[\])*)$/.exec(t)!;
  return `${m[1] === "char" ? '"char"' : m[1]}${m[2]}`;
}

export const literal = (s: string): string => `'${s.replace(/'/g, "''")}'`;

export interface Arg {
  readonly type: string;
  readonly s0: string;
  readonly s1: string;
  readonly nul: string;
}

/** Small backend numbers name whichever sessions are connected: use numbers no backend has. */
const LIVE_BACKENDS = /^pg_stat_get_backend_/;
const NO_BACKEND: readonly string[] = ["-1", "2147483647"];

export function argOf(type: string, name = ""): Arg {
  const nul = type === "record" ? "NULL::record" : `NULL::${typeSql(type)}`;
  if (type === "record") return { type, s0: "ROW('0'::int4, ''::text)", s1: "ROW('1'::int4, 'a'::text)", nul };
  const s = type === "int4" && LIVE_BACKENDS.test(name) ? NO_BACKEND : samplesOf(type);
  const lit = (v: string | undefined): string => (v === undefined ? nul : `${literal(v)}::${typeSql(type)}`);
  return { type, s0: lit(s[0]), s1: lit(s[1] ?? s[0]), nul };
}

export interface Call {
  readonly name: string;
  readonly proc: Proc | null;
  readonly sig: string | null;
  readonly kind: string;
  readonly aggkind: string | null;
  readonly retset: boolean;
  readonly direct: number;
  readonly args: readonly Arg[];
  readonly pickArgs: readonly string[];
  readonly outCols: boolean;
  /** `record` result without OUT columns: `SELECT * FROM f()` needs a column definition list. */
  readonly anonymousRecord: boolean;
}

export type Calls = { readonly calls: readonly Call[] } | { readonly skip: string };

export function arities(p: Proc): (readonly string[])[] {
  if (p.variadic) {
    const fixed = p.args.slice(0, -1);
    return [[...fixed, p.variadic], [...fixed, p.variadic, p.variadic]];
  }
  const out: (readonly string[])[] = [];
  for (let n = p.args.length - p.defaults; n <= p.args.length; n++) out.push(p.args.slice(0, n));
  return out;
}

export function callsOf(p: Proc): Calls {
  if (p.kind === "p") return { skip: "procedure" };
  for (const t of p.args) {
    const bad = unusable(t);
    if (bad) return { skip: bad };
  }
  const calls: Call[] = [];
  const seen = new Set<string>();
  for (const list of arities(p)) {
    const insts = list.some(isPolymorphic) ? INSTS : INSTS.slice(0, 1);
    for (const inst of insts) {
      const types = list.map((t) => instantiate(t, inst));
      if (types.some((t) => t === null)) continue;
      const concrete = types as string[];
      const key = concrete.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      let direct = p.aggkind === "o" ? p.direct : 0;
      // hypothetical-set: as many direct arguments as ordering ones (`rank(1) WITHIN GROUP (ORDER BY x)`)
      let args = concrete;
      if (p.aggkind === "h") {
        direct = concrete.length;
        args = [...concrete, ...concrete];
      }
      calls.push({
        name: p.name, proc: p, sig: null, kind: p.kind, aggkind: p.aggkind, retset: p.retset, direct,
        args: args.map((t) => argOf(t, p.name)),
        pickArgs: p.aggkind === "o" || p.aggkind === "h" ? args.slice(0, direct) : args,
        outCols: p.outCols,
        anonymousRecord: p.ret === "record" && !p.outCols,
      });
    }
  }
  return calls.length ? { calls } : { skip: "no instantiation" };
}

const PATTERNS: { readonly [p: string]: readonly string[] } = {
  anynumeric: ["int4", "numeric", "float8"],
  anystring: ["text", "varchar", "name"],
  anyjson: ["json", "jsonb", "jsonb"],
  anydatetime: ["timestamptz", "date", "timestamp"],
  anyrange: ["int4range", "int4multirange", "tstzrange"],
};

const ORDERED_RET = /^\$(wg|wgarr|pct|pctarr)$/;

export function callsOfSig(name: string, index: number, s: OurSig, inPgProc: boolean): Calls {
  const variadic = s.args.at(-1) === "...";
  const fixed = variadic ? s.args.slice(0, -1) : s.args;
  const rest = variadic ? [1, 2] : [0];
  // the name's pg_proc overloads are its calls
  if (variadic && !fixed.length && inPgProc) return { skip: "arguments not checked" };
  const calls: Call[] = [];
  const seen = new Set<string>();
  for (let k = 0; k < 3; k++) {
    const inst = INSTS[k]!;
    const one = (p: string): string => (p === "any" ? inst.elem : PATTERNS[p]?.[k] ?? (p === "anyarray" ? `${inst.elem}[]` : p));
    for (const extra of rest) {
      const list = [...fixed, ...Array<string>(extra).fill("any")].map(one);
      const ordered = s.agg && ORDERED_RET.test(s.ret);
      const args = ordered ? [...list, s.ret.startsWith("$pct") ? "float8" : inst.elem] : list;
      const key = args.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      calls.push({
        name, proc: null, sig: `${name}#${index}`,
        kind: s.window ? "w" : s.agg ? "a" : "f",
        aggkind: s.agg ? (ordered ? "o" : "n") : null,
        retset: s.srf, direct: ordered ? list.length : 0,
        args: args.map((t) => argOf(t, name)), pickArgs: list,
        outCols: false, anonymousRecord: s.ret === "record",
      });
    }
  }
  return calls.length ? { calls } : { skip: "no instantiation" };
}

export const KEYWORD_FORMS: ReadonlySet<string> = new Set([
  "current_date", "current_time", "current_timestamp", "localtime", "localtimestamp", "current_user", "current_role", "session_user", "user",
  "current_catalog", "system_user",
]);

/** Names whose plain call is a syntax error on the server (special syntax, or read as a type with a typmod): called schema-qualified. */
export const QUALIFIED: ReadonlySet<string> = new Set(["extract", "position", "normalize", "xmlexists", "char", "varchar", "bit", "numeric", "time", "timestamp", "interval"]);

export const NEEDS_CONTEXT: { readonly [name: string]: string } = {
  merge_action: "needs-context: MERGE … RETURNING",
};

export interface Column {
  readonly expr: string;
  readonly variant: string;
}

export interface Statement {
  readonly text: string;
  readonly form: string;
  readonly columns: readonly Column[];
  readonly tail: string;
}

export function variants(args: readonly Arg[]): { readonly variant: string; readonly values: readonly string[] }[] {
  const out = [{ variant: "s0", values: args.map((a) => a.s0) }];
  if (args.some((a) => a.s1 !== a.s0)) out.push({ variant: "s1", values: args.map((a) => a.s1) });
  args.forEach((_, i) => out.push({ variant: `n${i + 1}`, values: args.map((a, j) => (j === i ? a.nul : a.s0)) }));
  return out;
}

export function callSql(c: Pick<Call, "name" | "proc">, args: readonly string[]): string {
  if (!args.length && KEYWORD_FORMS.has(c.name)) return c.name;
  const schema = c.proc?.schema ?? "pg_catalog";
  const fn = QUALIFIED.has(c.name) ? `${schema}.${c.name}` : /^[a-z_][a-z0-9_]*$/.test(c.name) ? c.name : `"${c.name}"`;
  return `${fn}(${args.join(", ")})`;
}

export function statementsOf(c: Call): Statement[] {
  const vs = variants(c.args);
  if (c.kind === "f") {
    const columns = vs.map((v) => ({ expr: callSql(c, v.values), variant: v.variant }));
    if (!c.retset) return [{ text: `SELECT ${columns.map((x) => x.expr).join(", ")}`, form: "scalar", columns, tail: "" }];
    // one variant per statement: set-returning functions side by side in a select list are padded with NULLs to the longest
    const out: Statement[] = [];
    for (const col of columns) {
      out.push({ text: `SELECT ${col.expr}`, form: "srf-select", columns: [col], tail: "" });
      if (!c.anonymousRecord) out.push({ text: `SELECT * FROM ${col.expr}`, form: "srf", columns: [col], tail: "" });
    }
    return out;
  }
  const cols: string[] = ["g"];
  const vals: string[] = ["1"];
  const hasS1 = vs.some((v) => v.variant === "s1");
  const ref = (i: number, which: "a" | "b" | "n"): string => `v.${which}${i + 1}`;
  c.args.forEach((a, i) => {
    if (i < c.direct) return;
    cols.push(`a${i + 1}`);
    vals.push(a.s0);
    if (hasS1) (cols.push(`b${i + 1}`), vals.push(a.s1));
    cols.push(`n${i + 1}`);
    vals.push(a.nul);
  });
  const values = `(VALUES (${vals.join(", ")})) v(${cols.join(", ")})`;
  const exprs = vs.map((v) => {
    const at = (i: number): string => {
      if (i < c.direct) return v.values[i]!;
      if (v.variant === "s1") return ref(i, "b");
      return v.variant === `n${i + 1}` ? ref(i, "n") : ref(i, "a");
    };
    const all = c.args.map((_, i) => at(i));
    if (c.aggkind === "o" || c.aggkind === "h") {
      const fn = callSql(c, all.slice(0, c.direct));
      return { variant: v.variant, expr: `${fn} WITHIN GROUP (ORDER BY ${all.slice(c.direct).join(", ")})` };
    }
    const fn = !all.length && c.kind === "a" ? `${callSql(c, ["*"])}` : callSql(c, all);
    return { variant: v.variant, expr: fn };
  });
  const select = (columns: readonly Column[], tail: string, form: string): Statement => ({ text: `SELECT ${columns.map((x) => x.expr).join(", ")}${tail}`, form, columns, tail });
  if (c.kind === "w") return [select(exprs.map((e) => ({ ...e, expr: `${e.expr} OVER ()` })), ` FROM ${values}`, "window")];
  const out = [select(exprs, ` FROM ${values} GROUP BY v.g`, "agg"), select(exprs, ` FROM ${values} WHERE false`, "agg-empty")];
  if (c.aggkind === "n") out.push(select(exprs.map((e) => ({ ...e, expr: `${e.expr} OVER ()` })), ` FROM ${values}`, "window"));
  return out;
}

/** Strict NULLs only when no overload of the same name and arity is non-strict: the server might pick that one. */
export function strictNulls(c: Call, s: Statement, procs: readonly Proc[]): number[] {
  const p = c.proc;
  if (!p || s.form !== "scalar" || c.kind !== "f" || c.retset || !p.strict) return [];
  if (procs.some((q) => q.name === p.name && !q.strict && takes(q, c.args.length))) return [];
  const out: number[] = [];
  s.columns.forEach((col, i) => {
    if (col.variant.startsWith("n")) out.push(i);
  });
  return out;
}

export function takes(q: Proc, n: number): boolean {
  if (q.variadic) return n >= q.args.length;
  return n >= q.args.length - q.defaults && n <= q.args.length;
}

export function flagDifferences(p: Proc, s: OurSig): string[] {
  const out: string[] = [];
  const agg = p.kind === "a";
  const win = p.kind === "w";
  if (agg !== s.agg) out.push(agg ? "an aggregate, typed as not one" : "not an aggregate, typed as one");
  if (win !== s.window) out.push(win ? "a window function, typed as not one" : "not a window function, typed as one");
  if (p.retset !== s.srf) out.push(p.retset ? "set-returning, typed as not" : "not set-returning, typed as set-returning");
  return out;
}

/** Volatile functions that are safe to run in a rolled-back transaction (no effect outside it, quick). */
export const RUN_VOLATILE: ReadonlySet<string> = new Set([
  "random", "random_normal", "setseed", "gen_random_uuid", "gen_random_bytes", "gen_salt", "uuidv4", "uuidv7", "uuid_generate_v1",
  "uuid_generate_v1mc", "uuid_generate_v4", "clock_timestamp", "timeofday", "array_sample", "array_shuffle", "current_query",
  "pg_is_in_recovery", "pg_jit_available", "txid_status", "pg_xact_status", "pg_current_wal_lsn", "pg_current_wal_insert_lsn",
  "pg_current_wal_flush_lsn", "pg_last_wal_receive_lsn", "pg_last_wal_replay_lsn", "pg_last_xact_replay_timestamp",
  "pg_is_wal_replay_paused", "pg_get_wal_replay_pause_state", "pg_notification_queue_usage", "pg_database_size", "pg_relation_size",
  "pg_table_size", "pg_indexes_size", "pg_total_relation_size", "pg_tablespace_size", "pg_collation_actual_version",
  "pg_database_collation_actual_version", "pg_partition_tree", "pg_partition_ancestors", "currval", "lastval", "pg_current_logfile",
  "pg_blocking_pids", "pg_safe_snapshot_blocking_pids", "pg_last_committed_xact", "pg_xact_commit_timestamp", "pg_xact_commit_timestamp_origin",
]);

export function literalUnion(r: Evaluated): string[] {
  if ("error" in r) throw new Error(`functions oracle: ${r.error}`);
  const v = parseTypeText(r.text);
  const list: readonly TypeValue[] = typeof v === "string" ? [v] : v !== null && typeof v === "object" && "union" in v ? (v.union as readonly TypeValue[]) : [];
  return list.filter((x): x is string => typeof x === "string").sort();
}

export function sigOf(v: TypeValue): OurSig | null {
  if (!v || typeof v !== "object" || Array.isArray(v) || "union" in v || "and" in v || "ref" in v) return null;
  const r = v as { readonly [k: string]: TypeValue };
  const args = Array.isArray(r.args) ? (r.args as TypeValue[]).map(String) : [];
  const strict = r.strict;
  return {
    args,
    ret: typeof r.ret === "string" ? r.ret : JSON.stringify(r.ret),
    strict: typeof strict === "boolean" ? strict : Array.isArray(strict) ? (strict as TypeValue[]).map(Number) : "-",
    nullable: typeof r.nullable === "boolean" ? r.nullable : "-",
    agg: r.agg === true,
    window: r.window === true,
    srf: r.srf === true,
  };
}

export function sigsOf(r: Evaluated, name: string): OurSig[] {
  if ("error" in r) throw new Error(`functions oracle: signatures of ${name}: ${r.error}`);
  const v = parseTypeText(r.text);
  if (!Array.isArray(v)) throw new Error(`functions oracle: signatures of ${name}: ${r.text}`);
  return (v as TypeValue[]).map((x) => sigOf(x)).filter((s): s is OurSig => s !== null);
}

export function readPick(r: Evaluated): { sig: OurSig; ok: boolean } | null {
  if ("error" in r) return null;
  const v = parseTypeText(r.text);
  if (!v || typeof v !== "object" || Array.isArray(v) || !("sig" in v)) return null;
  const sig = sigOf((v as { sig: TypeValue }).sig);
  return sig ? { sig, ok: (v as { ok: TypeValue }).ok === true } : null;
}

export const sameSig = (a: OurSig, b: OurSig): boolean => JSON.stringify(a) === JSON.stringify(b);

export function runnable(name: string, procs: readonly Proc[]): boolean {
  const mine = procs.filter((p) => p.name === name);
  return mine.every((p) => p.volatile !== "v" || RUN_VOLATILE.has(p.name));
}

export const SPECIAL: { readonly [name: string]: readonly Statement[] } = {
  grouping: [
    { text: "SELECT grouping(v.g) FROM (VALUES (1)) v(g) GROUP BY v.g", form: "agg", columns: [{ expr: "grouping(v.g)", variant: "s0" }], tail: " FROM (VALUES (1)) v(g) GROUP BY v.g" },
    { text: "SELECT grouping(v.g, v.h) FROM (VALUES (1, NULL::int4)) v(g, h) GROUP BY ROLLUP (v.g, v.h)", form: "agg", columns: [{ expr: "grouping(v.g, v.h)", variant: "s0" }], tail: " FROM (VALUES (1, NULL::int4)) v(g, h) GROUP BY ROLLUP (v.g, v.h)" },
  ],
};
