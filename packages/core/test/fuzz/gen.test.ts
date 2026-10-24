import fc from "fast-check";
import { expect, test } from "vitest";
import { kinds, numberParams, statement } from "./gen.js";
import { fuzzDbType, fuzzSetup, TABLES } from "./schema.js";

test("the generator is deterministic per seed, numbers its parameters and records node kinds", () => {
  const a = fc.sample(statement(), { seed: 3, numRuns: 30 });
  const b = fc.sample(statement(), { seed: 3, numRuns: 30 });
  expect(a.map((s) => s.sql)).toEqual(b.map((s) => s.sql));
  for (const s of a) {
    expect(s.sql).not.toContain("$?");
    const ns = [...s.sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(new Set(ns).size === 0 || Math.max(...ns) === new Set(ns).size).toBe(true);
    const k = kinds(s);
    expect(k).toEqual([...k].sort());
    expect(k.length).toBeGreaterThan(0);
  }
  const all = new Set(fc.sample(statement(), { seed: 5, numRuns: 200 }).flatMap(kinds));
  for (const kind of ["left-join-on", "is-not-null", "not-between", "in", "case", "coalesce", "filter", "window", "exists", "cte", "recursive-cte", "insert", "update", "delete", "jsonb_build_object", "lateral"]) expect(all).toContain(kind);
  expect([...all].some((x) => x.startsWith("setop-"))).toBe(true);
  expect([...all].some((x) => /^group-by-(rollup|cube|grouping-sets)$/.test(x))).toBe(true);
  expect([...all].some((x) => /-join-(using|natural)$/.test(x))).toBe(true);
}, 120_000);

test("parameters are numbered in order of appearance", () => {
  expect(numberParams({ k: "x", sql: "SELECT $?::int4, $?::text", c: [] }).sql).toBe("SELECT $1::int4, $2::text");
});

test("the schema: DDL with NULLs in every nullable column, an empty table, and the same tables as a DB type", () => {
  const ddl = fuzzSetup();
  expect(ddl[0]).toBe("CREATE TYPE mood AS ENUM ('happy', 'sad', 'meh')");
  for (const t of TABLES) {
    expect(fuzzDbType()).toContain(`${t.name}: {`);
    for (const [i, c] of t.columns.entries()) if (c.nullable && t.rows.length) expect(t.rows.some((r) => r[i] === "NULL")).toBe(true);
  }
  expect(TABLES.find((t) => t.name === "t4")!.rows).toEqual([]);
});
