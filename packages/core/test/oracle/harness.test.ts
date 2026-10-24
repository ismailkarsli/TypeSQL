import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { Analysis } from "../../src/cache/evaluate.js";
import { readBaseline, writeBaseline } from "./baseline.js";
import { compareStatement, normalizeOurs, type Observed } from "./compare.js";
import { copyViaProgram } from "./replay.js";
import { readDb, sampleTexts, schemaDdl, seedRows } from "./schema.js";
import { causeOf, diffDbs, kindOf } from "./regress.js";
import { positional } from "./types.js";

const analysis = (cols: Analysis["cols"], params: Analysis["params"] = {}, max = 0): { analysis: Analysis } => ({ analysis: { kind: "select", cols, params, max, names: [] } });
const observed = (o: Partial<Observed>): { observed: Observed } => ({ observed: { columns: [], params: [], rows: [], runs: 1, runErrors: [], ...o } });

test("our type names as the server spells them", () => {
  expect(normalizeOurs("null")).toBe("text");
  expect(normalizeOurs("_int4")).toBe("int4[]");
  expect(normalizeOurs("numeric(10, 2)")).toBe("numeric");
  expect(normalizeOurs("app.kind")).toBe("kind");
  expect(normalizeOurs("pg_catalog.int4")).toBe("int4");
});

test("names, types, parameters and NULLs", () => {
  const ours = analysis([{ name: "a", type: "int4", nullable: false }, { name: "b", type: "null", nullable: true }], { 1: { type: "int4", nullable: false } }, 1);
  expect(compareStatement(ours, observed({ columns: [{ name: "a", type: "int4" }, { name: "b", type: "text" }], params: ["int4"], rows: [[1, null]] }))).toEqual({ disagreements: [] });
  expect(compareStatement(ours, observed({ columns: [{ name: "a", type: "int8" }, { name: "c", type: "text" }], params: ["int8"], rows: [[null, null]] }))).toEqual({
    disagreements: [
      { kind: "unsound", detail: 'column 1 "a": type int4, server int8' },
      { kind: "unsound", detail: 'column 2: name "b", server "c"' },
      { kind: "unsound", detail: 'column 1 "a": typed non-null, the server returned NULL' },
      { kind: "unsound", detail: "$1: type int4, server int8" },
    ],
  });
});

test("a * expansion compares by name, duplicates as the drivers collapse them (the last column wins)", () => {
  const ours = analysis([{ name: "id", type: "int8", nullable: false, star: true }, { name: "email", type: "text", nullable: false, star: true }]);
  const cols = [{ name: "id", type: "int4" }, { name: "email", type: "text" }, { name: "id", type: "int8" }];
  expect(compareStatement(ours, observed({ columns: cols, rows: [[1, "a", 2]] }))).toEqual({ disagreements: [] });
  expect(compareStatement(ours, observed({ columns: cols, rows: [[1, "a", null]] }))).toEqual({ disagreements: [{ kind: "unsound", detail: 'column "id": typed non-null, the server returned NULL' }] });
});

test("rejects, accepts, crashes and what is not a disagreement", () => {
  const ok = analysis([]);
  expect(compareStatement({ error: "nope" }, observed({}))).toEqual({ disagreements: [{ kind: "rejects", detail: "ours: nope" }] });
  expect(compareStatement({ error: "nope" }, observed({ runErrors: [{ code: "23502", message: "x" }] }))).toEqual({ disagreements: [] });
  expect(compareStatement({ error: 'null value in column "x" violates not-null constraint' }, observed({}))).toEqual({ skip: "data-dependent" });
  expect(compareStatement({ error: "nope" }, { error: { code: "42703", message: "no column" } })).toEqual({ disagreements: [] });
  expect(compareStatement(ok, { error: { code: "42703", message: "no column" } })).toEqual({ disagreements: [{ kind: "accepts", detail: "server: 42703 no column" }] });
  expect(compareStatement(ok, { error: { code: "22P02", message: "malformed array literal" } })).toEqual({ skip: "invalid-input" });
  expect(compareStatement(ok, { error: { code: "3F000", message: "schema does not exist" } })).toEqual({ disagreements: [{ kind: "accepts", detail: "server: 3F000 schema does not exist" }] });
  expect(compareStatement(ok, { error: { code: "34000", message: "cursor does not exist" } })).toEqual({ skip: "needs-context" });
  expect(compareStatement(ok, { error: { code: "53200", message: "out of memory" } })).toEqual({ skip: "server-error" });
  expect(compareStatement({ crash: "TS2589" }, observed({}))).toEqual({ disagreements: [{ kind: "crash", detail: "TS2589" }] });
});

test("positional text: :name first, inline markers after", () => {
  expect(positional("SELECT :a, :b, :a")).toBe("SELECT $1, $2, $1");
  expect(positional("SELECT :a, \u0000Pn\u0000, \u0000D-s\u0000")).toBe("SELECT $1, $2, $3");
  expect(positional("SELECT $1, \u0000Pn\u0000")).toBe("SELECT $1, $2");
});

test("a DB as DDL and seed rows", () => {
  const db = readDb({
    $types: { types: { mood: { union: ["happy", "sad"] } } },
    users: { table: { id: { t: "int4", n: false, d: true }, mood: { t: "mood", n: true, d: false }, tags: { t: "text[]", n: false, d: false } } },
    v: { view: { id: { t: "int4", n: false, d: false } } },
    auth: { ns: { sessions: { table: { at: { t: "timestamptz", n: true, d: false } } } } },
    app: { ns: {} },
    pg_catalog: { ns: { pg_class: { view: {} } } },
  });
  expect(schemaDdl(db).map((s) => s.sql)).toEqual([
    `CREATE TYPE "mood" AS ENUM ('happy', 'sad')`,
    `CREATE SCHEMA IF NOT EXISTS "auth"`,
    `CREATE SCHEMA IF NOT EXISTS "app"`,
    `CREATE TABLE "public"."users" ("id" serial NOT NULL, "mood" "mood", "tags" "text"[] NOT NULL)`,
    `CREATE TABLE "public"."v__base" ("id" "int4" NOT NULL); CREATE VIEW "public"."v" AS SELECT * FROM "public"."v__base" UNION ALL SELECT * FROM "public"."v__base" WHERE false`,
    `CREATE TABLE "auth"."sessions" ("at" "timestamptz")`,
  ]);
  const rows = seedRows(db, db.relations[0]!);
  expect(rows[0]).toBe(`INSERT INTO "public"."users" ("id", "mood", "tags") VALUES ('0'::"int4", NULL, '{}'::"text"[])`);
  expect(rows).toHaveLength(5);
  expect(sampleTexts("int4[]")).toEqual(["{}", '{"0","-1"}']);
  expect(sampleTexts("mood", db.enums)).toEqual(["happy", "sad"]);
  expect(sampleTexts("widget")).toEqual([]);
});

test("regression statements: what is checked, and as which text", () => {
  expect(kindOf("SELECT 1;")).toEqual({ t: "query", text: "SELECT 1" });
  expect(kindOf("-- c\n(SELECT 1) UNION SELECT 2")).toEqual({ t: "query", text: "(SELECT 1) UNION SELECT 2" });
  expect(kindOf("DECLARE c NO SCROLL CURSOR WITH HOLD FOR SELECT a FROM t;")).toEqual({ t: "query", text: "SELECT a FROM t" });
  expect(kindOf("PREPARE q(int4, text) AS SELECT $1 + 1, $2, '$1';")).toEqual({ t: "query", text: "SELECT ($1::int4) + 1, ($2::text), '$1'" });
  expect(kindOf("SELECT a INTO TEMP t2 FROM t")).toEqual({ t: "ddl" });
  expect(kindOf("ALTER TABLE t ADD COLUMN b int")).toEqual({ t: "ddl" });
  expect(kindOf("SET search_path = x")).toEqual({ t: "other" });
});

test("DDL results compared by relation and column name", () => {
  const db = (cols: Record<string, { t: string; n: boolean; d: boolean }>) => readDb({ t: { table: cols }, other: { table: {} } });
  const words = new Set(["t"]);
  expect(diffDbs(db({ a: { t: "int4", n: false, d: false }, b: { t: "text", n: true, d: false } }), db({ b: { t: "text", n: true, d: false }, a: { t: "int4", n: false, d: false } }), words)).toEqual([]);
  expect(diffDbs(db({ a: { t: "int4", n: false, d: true } }), db({ a: { t: "int8", n: true, d: false } }), words)).toEqual([
    { kind: "unsound", detail: "public.t.a: type int4, server int8" },
    { kind: "unsound", detail: "public.t.a: NOT NULL in ours only" },
    { kind: "unsound", detail: "public.t.a: a default in ours only" },
  ]);
  expect(diffDbs(readDb({}), db({ a: { t: "int4", n: true, d: false } }), words)).toEqual([{ kind: "unsound", detail: "public.t: missing in ours" }]);
  expect(causeOf("ours: function f(int4) does not exist")).toBe("unknown function");
});

test("COPY FROM STDIN and TO STDOUT go through a program on the server", () => {
  expect(copyViaProgram("copy t (a) from stdin with (header match);", "a\\nb\n")).toBe(`copy t (a) FROM PROGRAM 'echo ${Buffer.from("a\\nb\n").toString("base64")} | base64 -d' with (header match);`);
  expect(copyViaProgram("COPY t FROM STDOUT")).toBe("COPY t FROM PROGRAM 'echo  | base64 -d'");
  expect(copyViaProgram("copy (select 1) to stdout csv")).toBe("copy (select 1) TO PROGRAM 'cat > /dev/null' csv");
  expect(copyViaProgram("SELECT 'from stdin'")).toBe("SELECT 'from stdin'");
});

test("a baseline is written on one line, groups sorted and empty ones dropped, and reads back", () => {
  const dir = mkdtempSync(join(tmpdir(), "typesql-baseline-"));
  try {
    const path = join(dir, "b.json");
    const entry = (i: number) => ({ kind: "rejects", hash: String(i) });
    writeBaseline(path, { postgres: "18.6" }, "disagreements", { b: [entry(1)], a: [entry(2), entry(3)], empty: [] });
    expect(readFileSync(path, "utf8")).toBe(
      '{"postgres":"18.6","disagreements":{"a":[{"kind":"rejects","hash":"2"},{"kind":"rejects","hash":"3"}],"b":[{"kind":"rejects","hash":"1"}]}}\n',
    );
    expect(readBaseline(path, "disagreements")).toEqual({ pins: { postgres: "18.6" }, entries: { a: [entry(2), entry(3)], b: [entry(1)] } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
