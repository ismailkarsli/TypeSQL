import { expect, test } from "vitest";
import {
  argOf, callsOf, callsOfSig, callSql, flagDifferences, literalUnion, readPick, runnable, samplesOf, sigsOf, statementsOf, strictNulls, typeSql, variants,
  type Call, type OurSig, type Proc,
} from "./calls.js";

const proc = (name: string, args: string[], more: Partial<Proc> = {}): Proc => ({
  schema: "pg_catalog", name, args, defaults: 0, variadic: null, kind: "f", aggkind: null, direct: 0, retset: false, strict: true, volatile: "i", ret: "text", outCols: false, ...more,
});
const sig = (args: string[], more: Partial<OurSig> = {}): OurSig => ({ args, ret: "text", strict: "-", nullable: "-", agg: false, window: false, srf: false, ...more });
const calls = (p: Proc): readonly Call[] => {
  const r = callsOf(p);
  if ("skip" in r) throw new Error(r.skip);
  return r.calls;
};
const texts = (c: Call): string[] => statementsOf(c).map((s) => s.text);

test("argument values: typed samples, a typed NULL; \"char\" quoted; a record as ROW", () => {
  expect(argOf("int4")).toEqual({ type: "int4", s0: "'0'::int4", s1: "'1'::int4", nul: "NULL::int4" });
  expect(argOf("text[]")).toEqual({ type: "text[]", s0: "'{}'::text[]", s1: `'{"","a"}'::text[]`, nul: "NULL::text[]" });
  expect(argOf("char").s0).toBe(`'a'::"char"`);
  expect(argOf("int4", "pg_stat_get_backend_pid")).toEqual({ type: "int4", s0: "'-1'::int4", s1: "'2147483647'::int4", nul: "NULL::int4" });
  expect(argOf("int4", "pg_stat_get_db_numbackends").s0).toBe("'0'::int4");
  expect(argOf("record")).toEqual({ type: "record", s0: "ROW('0'::int4, ''::text)", s1: "ROW('1'::int4, 'a'::text)", nul: "NULL::record" });
  expect(argOf("gtsvector")).toEqual({ type: "gtsvector", s0: "NULL::gtsvector", s1: "NULL::gtsvector", nul: "NULL::gtsvector" });
  expect(samplesOf("regconfig")).toEqual(["english", "simple"]);
  expect(typeSql("char[]")).toBe('"char"[]');
});

test("variants: samples, other samples, a NULL in each position", () => {
  expect(variants([argOf("int4"), argOf("bool")]).map((v) => `${v.variant}: ${v.values.join(", ")}`)).toEqual([
    "s0: '0'::int4, 'true'::bool",
    "s1: '1'::int4, 'false'::bool",
    "n1: NULL::int4, 'true'::bool",
    "n2: '0'::int4, NULL::bool",
  ]);
  expect(variants([argOf("cidr")]).map((v) => v.variant)).toEqual(["s0", "n1"]);
});

test("a scalar function: one statement, a column per variant; strict NULLs known without running", () => {
  const p = proc("lower", ["text"]);
  const [c] = calls(p);
  const [st] = statementsOf(c!);
  expect(st!.text).toBe("SELECT lower(''::text), lower('a'::text), lower(NULL::text)");
  expect(strictNulls(c!, st!, [p])).toEqual([2]);
  expect(strictNulls(c!, st!, [p, proc("lower", ["anyrange"], { strict: false })])).toEqual([]);
  expect(strictNulls(c!, st!, [p, proc("lower", ["text", "text"], { strict: false, defaults: 1 })])).toEqual([]);
  expect(strictNulls(c!, st!, [p, proc("lower", ["text", "text"], { strict: false })])).toEqual([2]);
});

test("polymorphic parameters instantiated with int4, text and jsonb; ranges only with int4", () => {
  expect(calls(proc("array_append", ["anycompatiblearray", "anycompatible"])).map((c) => c.args.map((a) => a.type).join(", "))).toEqual(["int4[], int4", "text[], text", "jsonb[], jsonb"]);
  expect(calls(proc("lower", ["anyrange"])).map((c) => c.args.map((a) => a.type).join(", "))).toEqual(["int4range"]);
  expect(calls(proc("range_merge", ["anymultirange"])).map((c) => c.args[0]!.type)).toEqual(["int4multirange"]);
  expect(calls(proc("enum_first", ["anyenum"])).map((c) => texts(c))).toEqual([["SELECT enum_first('happy'::mood), enum_first('sad'::mood), enum_first(NULL::mood)"]]);
});

test("variadic with one and two arguments, defaults left out one by one", () => {
  expect(calls(proc("jsonb_extract_path", ["jsonb", "text[]"], { variadic: "text" })).map((c) => c.args.map((a) => a.type).join(", "))).toEqual(["jsonb, text", "jsonb, text, text"]);
  expect(calls(proc("concat", ["any"], { variadic: "any" })).map((c) => c.args.map((a) => a.type).join(", "))).toEqual(["int4", "text", "jsonb", "int4, int4", "text, text", "jsonb, jsonb"]);
  expect(calls(proc("jsonb_path_exists", ["jsonb", "jsonpath", "jsonb", "bool"], { defaults: 2 })).map((c) => c.args.length)).toEqual([2, 3, 4]);
});

test("aggregates: grouped over a VALUES list, over no rows, and as a window function", () => {
  const [c] = calls(proc("sum", ["int4"], { kind: "a", aggkind: "n", ret: "bigint" }));
  expect(texts(c!)).toEqual([
    "SELECT sum(v.a1), sum(v.b1), sum(v.n1) FROM (VALUES (1, '0'::int4, '1'::int4, NULL::int4)) v(g, a1, b1, n1) GROUP BY v.g",
    "SELECT sum(v.a1), sum(v.b1), sum(v.n1) FROM (VALUES (1, '0'::int4, '1'::int4, NULL::int4)) v(g, a1, b1, n1) WHERE false",
    "SELECT sum(v.a1) OVER (), sum(v.b1) OVER (), sum(v.n1) OVER () FROM (VALUES (1, '0'::int4, '1'::int4, NULL::int4)) v(g, a1, b1, n1)",
  ]);
  expect(texts(calls(proc("count", [], { kind: "a", aggkind: "n" }))[0]!)[0]).toBe("SELECT count(*) FROM (VALUES (1)) v(g) GROUP BY v.g");
  const st = statementsOf(c!)[0]!;
  expect(`SELECT ${st.columns[2]!.expr}${st.tail}`).toBe("SELECT sum(v.n1) FROM (VALUES (1, '0'::int4, '1'::int4, NULL::int4)) v(g, a1, b1, n1) GROUP BY v.g");
});

test("ordered-set and hypothetical-set aggregates: WITHIN GROUP, direct arguments in place", () => {
  const [c] = calls(proc("percentile_cont", ["float8", "float8"], { kind: "a", aggkind: "o", direct: 1 }));
  expect(c!.pickArgs).toEqual(["float8"]);
  expect(texts(c!)).toEqual([
    "SELECT percentile_cont('0'::float8) WITHIN GROUP (ORDER BY v.a2), percentile_cont('-1.5'::float8) WITHIN GROUP (ORDER BY v.b2), percentile_cont(NULL::float8) WITHIN GROUP (ORDER BY v.a2), percentile_cont('0'::float8) WITHIN GROUP (ORDER BY v.n2) FROM (VALUES (1, '0'::float8, '-1.5'::float8, NULL::float8)) v(g, a2, b2, n2) GROUP BY v.g",
    "SELECT percentile_cont('0'::float8) WITHIN GROUP (ORDER BY v.a2), percentile_cont('-1.5'::float8) WITHIN GROUP (ORDER BY v.b2), percentile_cont(NULL::float8) WITHIN GROUP (ORDER BY v.a2), percentile_cont('0'::float8) WITHIN GROUP (ORDER BY v.n2) FROM (VALUES (1, '0'::float8, '-1.5'::float8, NULL::float8)) v(g, a2, b2, n2) WHERE false",
  ]);
  const rank = calls(proc("rank", ["any"], { kind: "a", aggkind: "h", variadic: "any" }));
  expect(rank[0]!.pickArgs).toEqual(["int4"]);
  expect(texts(rank[0]!)[0]).toBe("SELECT rank('0'::int4) WITHIN GROUP (ORDER BY v.a2), rank('1'::int4) WITHIN GROUP (ORDER BY v.b2), rank(NULL::int4) WITHIN GROUP (ORDER BY v.a2), rank('0'::int4) WITHIN GROUP (ORDER BY v.n2) FROM (VALUES (1, '0'::int4, '1'::int4, NULL::int4)) v(g, a2, b2, n2) GROUP BY v.g");
});

test("window functions: OVER () over the VALUES list", () => {
  expect(texts(calls(proc("row_number", [], { kind: "w" }))[0]!)).toEqual(["SELECT row_number() OVER () FROM (VALUES (1)) v(g)"]);
  expect(texts(calls(proc("lag", ["anyelement"], { kind: "w" }))[1]!)).toEqual(["SELECT lag(v.a1) OVER (), lag(v.b1) OVER (), lag(v.n1) OVER () FROM (VALUES (1, ''::text, 'a'::text, NULL::text)) v(g, a1, b1, n1)"]);
});

test("set-returning functions: one statement per variant, in the select list and in FROM", () => {
  expect(texts(calls(proc("generate_series", ["int4", "int4"], { retset: true }))[0]!)).toEqual([
    "SELECT generate_series('0'::int4, '0'::int4)",
    "SELECT * FROM generate_series('0'::int4, '0'::int4)",
    "SELECT generate_series('1'::int4, '1'::int4)",
    "SELECT * FROM generate_series('1'::int4, '1'::int4)",
    "SELECT generate_series(NULL::int4, '0'::int4)",
    "SELECT * FROM generate_series(NULL::int4, '0'::int4)",
    "SELECT generate_series('0'::int4, NULL::int4)",
    "SELECT * FROM generate_series('0'::int4, NULL::int4)",
  ]);
  expect(texts(calls(proc("json_to_recordset", ["json"], { retset: true, ret: "record" }))[0]!).every((t) => !t.includes("FROM"))).toBe(true);
});

test("keyword forms, special syntax qualified, quoted names", () => {
  expect(callSql({ name: "current_user", proc: null }, [])).toBe("current_user");
  expect(callSql({ name: "extract", proc: null }, ["'year'::text", "'2000-01-01'::date"])).toBe("pg_catalog.extract('year'::text, '2000-01-01'::date)");
  expect(callSql({ name: "similarity", proc: proc("similarity", [], { schema: "public" }) }, [])).toBe("similarity()");
  expect(callSql({ name: "timestamp", proc: proc("timestamp", [], { schema: "pg_catalog" }) }, ["x"])).toBe("pg_catalog.timestamp(x)");
});

test("what cannot be called is skipped with a reason", () => {
  expect(callsOf(proc("f", ["internal"]))).toEqual({ skip: "pseudo-type internal" });
  expect(callsOf(proc("p", [], { kind: "p" }))).toEqual({ skip: "procedure" });
});

test("calls of a catalog signature: patterns instantiated, a trailing ... with one and two more arguments", () => {
  const r = callsOfSig("length", 1, sig(["bytea", "anystring"]), true);
  if ("skip" in r) throw new Error(r.skip);
  expect(r.calls.map((c) => c.args.map((a) => a.type).join(", "))).toEqual(["bytea, text", "bytea, varchar", "bytea, name"]);
  const g = callsOfSig("greatest", 0, sig(["any", "..."]), false);
  if ("skip" in g) throw new Error(g.skip);
  expect(g.calls.map((c) => c.args.length)).toEqual([2, 3, 2, 3, 2, 3]);
  expect(callsOfSig("count", 0, sig(["..."], { agg: true }), true)).toEqual({ skip: "arguments not checked" });
  const c = callsOfSig("coalesce", 0, sig(["..."]), false);
  expect("calls" in c && c.calls.map((x) => x.args.length)).toEqual([1, 2, 1, 2, 1, 2]);
  const mode = callsOfSig("mode", 0, sig([], { agg: true, ret: "$wg" }), true);
  if ("skip" in mode) throw new Error(mode.skip);
  expect(texts(mode.calls[0]!)[0]).toBe("SELECT mode() WITHIN GROUP (ORDER BY v.a1), mode() WITHIN GROUP (ORDER BY v.b1), mode() WITHIN GROUP (ORDER BY v.n1) FROM (VALUES (1, '0'::int4, '1'::int4, NULL::int4)) v(g, a1, b1, n1) GROUP BY v.g");
});

test("aggregate, window and set-returning flags against pg_proc", () => {
  expect(flagDifferences(proc("sum", ["int4"], { kind: "a" }), sig(["int4"], { agg: true }))).toEqual([]);
  expect(flagDifferences(proc("sum", ["int4"], { kind: "a" }), sig(["int4"]))).toEqual(["an aggregate, typed as not one"]);
  expect(flagDifferences(proc("lag", ["anyelement"], { kind: "w" }), sig(["any"], { agg: true }))).toEqual(["not an aggregate, typed as one", "a window function, typed as not one"]);
  expect(flagDifferences(proc("f", [], { retset: true }), sig([]))).toEqual(["set-returning, typed as not"]);
  expect(flagDifferences(proc("f", []), sig([], { srf: true }))).toEqual(["not set-returning, typed as set-returning"]);
});

test("volatile functions are described only, unless known to be harmless", () => {
  const procs = [proc("pg_sleep", ["float8"], { volatile: "v" }), proc("random", [], { volatile: "v" }), proc("lower", ["text"])];
  expect(["pg_sleep", "random", "lower"].map((n) => runnable(n, procs))).toEqual([false, true, true]);
});


test("probe results read back", () => {
  expect(literalUnion({ text: '"b" | "a"' })).toEqual(["a", "b"]);
  expect(sigsOf({ text: '[{ args: ["int4"]; ret: "int8"; strict: "-"; nullable: "-"; agg: true; window: false; srf: false; }, { args: ["anyarray", "any"]; ret: "$1"; strict: [1]; nullable: false; agg: false; window: false; srf: false; }]' }, "x")).toEqual([
    sig(["int4"], { ret: "int8", agg: true }),
    sig(["anyarray", "any"], { ret: "$1", strict: [1], nullable: false }),
  ]);
  expect(readPick({ text: '{ sig: { args: ["..."]; ret: "text"; strict: "-"; nullable: true; agg: false; window: false; srf: false; }; ok: true; }' })).toEqual({ sig: sig(["..."], { nullable: true }), ok: true });
  expect(readPick({ text: "null" })).toBe(null);
});
