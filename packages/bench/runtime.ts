#!/usr/bin/env node
// Runtime cost of building a query: `sql(...)` turns the call into `{ text, values }` (named and
// inline parameters rewritten to $n, fragments spliced). Nothing is parsed at runtime. Imports the
// built package, so run `pnpm build` first.
import { createSql, type Col, type Generated } from "@typesql/core";

interface DB {
  users: { id: Generated<"int4">; email: Col<"text"> };
}

const sql = createSql<DB>();
const where = sql.fragment("WHERE u.id > $1", 100);
const cases = {
  "positional $1": () => sql("SELECT id, email FROM users WHERE id = $1", 7),
  "named :email": () => sql("SELECT id FROM users WHERE email = :email AND id > :min", { email: "a@b.c", min: 10 }),
  "inline sql.param": () => sql(`SELECT id FROM users WHERE email = ${sql.param("a@b.c")} AND id > ${sql.param(10)}`),
  "fragment {slot}": () => sql("SELECT u.id FROM users u {where} AND u.email = $1", { where }, "x"),
};

const N = 1_000_000;
let sink: { readonly text: string } | undefined;
for (const [name, build] of Object.entries(cases)) {
  for (let i = 0; i < N / 10; i++) sink = build(); // warm up
  const started = performance.now();
  for (let i = 0; i < N; i++) sink = build();
  const ns = ((performance.now() - started) * 1e6) / N;
  console.log(`${name.padEnd(18)} ${(ns / 1000).toFixed(2)} µs per call`);
}
if (!sink!.text) throw new Error("unreachable");
