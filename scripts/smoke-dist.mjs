// Imports the *built* packages (dist/) with plain Node and exercises the runtime API.
// Tests run against TypeScript sources, which hides problems that only exist in emitted
// JavaScript (e.g. a value re-export of a `declare const`). Run after `pnpm build`.
import assert from "node:assert/strict";

const core = await import("../packages/core/dist/index.js");
const pg = await import("../packages/pg/dist/index.js");
const pgjs = await import("../packages/postgres/dist/index.js");

const sql = core.createSql();
assert.deepEqual(sql("SELECT id FROM users WHERE id = $1", 7), { text: "SELECT id FROM users WHERE id = $1", values: [7] });

const where = sql.fragment("AND age > :min", { min: 18 });
assert.deepEqual(sql("SELECT id FROM users WHERE email = :email {where}", { where }, { email: "a@b.c" }), {
  text: "SELECT id FROM users WHERE email = $1 AND age > $2",
  values: ["a@b.c", 18],
});
assert.deepEqual(sql("SELECT {col} FROM users", { col: sql.id("display_name") }), { text: 'SELECT "display_name" FROM users', values: [] });

const evil = "x'; DROP TABLE users; --";
assert.deepEqual(sql(`SELECT id FROM users WHERE email = ${sql.param(evil)} AND id > ${core.param(3)}`), {
  text: "SELECT id FROM users WHERE email = $1 AND id > $2",
  values: [evil, 3],
});

const doc = sql(`UPDATE docs SET items = ${sql.json([1, 2])}`);
assert.equal(doc.text, "UPDATE docs SET items = $1");
assert.ok(doc.values[0] instanceof core.JsonParam);
assert.equal(doc.values[0].toPostgres(), "[1,2]");
assert.equal(JSON.stringify(doc.values[0]), "[1,2]");

const m = core.migrations().add("CREATE TABLE t (id int)").add("ALTER TABLE t ADD COLUMN x text");
assert.deepEqual([...m.statements], ["CREATE TABLE t (id int)", "ALTER TABLE t ADD COLUMN x text"]);

for (const adapter of [pg, pgjs]) {
  assert.deepEqual(adapter.createSql()(`SELECT ${adapter.createSql().param(1)}`), { text: "SELECT $1", values: [1] });
  for (const name of ["createSql", "query", "one", "maybeOne", "many", "execute", "transaction", "migrate"]) {
    assert.equal(typeof adapter[name], "function", `adapter export ${name}`);
  }
  assert.deepEqual(adapter.createSql()("SELECT 1"), { text: "SELECT 1", values: [] });
}

const introspect = await import("../packages/pg/dist/introspect/index.js");
for (const name of ["introspect", "generateSource", "main", "parseNodeTree", "ViewNullability"]) {
  assert.equal(typeof introspect[name], "function", `@typesql/pg/introspect export ${name}`);
}
const generated = introspect.generateSource({
  version: "17.0",
  schemas: ["public"],
  relations: [{ schema: "public", name: "t", kind: "table", comment: null, columns: [{ name: "id", type: "int4", declaredType: "integer", domain: null, nullable: false, hasDefault: true, identity: null, generated: null, default: null, comment: null }] }],
  enums: [],
});
assert.match(generated, /id: Generated<"int4">;/);

const { execFileSync } = await import("node:child_process");
const help = execFileSync(process.execPath, [new URL("../packages/pg/dist/bin.js", import.meta.url).pathname, "--help"], { encoding: "utf8" });
assert.match(help, /^Usage: typesql introspect/);

console.log("dist smoke test: ok");
