import type { Col, Json } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	t: {
		id: Col<"int4">;
		doc: Json<{ views: number; ok: boolean }, { hasDefault: true }>;
		optional: Json<{ views: number; ok: boolean }, { nullable: true }, "json">;
		items: Json<readonly { views: number }[], { nullable: true }>;
		label: Json<"draft" | "published", { nullable: true }>;
		unshaped: Col<"json", { nullable: true }>;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(`CREATE TABLE t (
	id INTEGER PRIMARY KEY,
	doc JSONB NOT NULL DEFAULT '{"views":10,"ok":true}',
	optional JSON, items JSONB, label JSONB, unshaped JSON
)`);
const sql = createSql<DB>(pool);

await sql(
	`INSERT INTO t ${sql.values("t", [{ id: 1, doc: sql.json(undefined) }])}`,
).execute();
export const defaulted = await sql(
	"SELECT doc -> 'views' AS views FROM t",
).executeTakeFirstOrThrow();
await sql(`UPDATE t SET doc=${sql.json({ views: 2, ok: true })}`).execute();
export const inline = await sql(
	"SELECT doc -> 'views' AS views FROM t",
).executeTakeFirstOrThrow();
await sql(
	`UPDATE t SET ${sql.set("t", { doc: sql.json({ views: 3, ok: false }), optional: sql.json({ views: 4, ok: true }) })}`,
).execute();
await sql(
	`UPDATE t SET ${sql.set("t", { doc: sql.json(undefined), label: sql.json("published") })}`,
).execute();
export const set = await sql(
	"SELECT doc -> 'views' AS views, optional -> 'views' AS optional FROM t",
).executeTakeFirstOrThrow();
await sql(
	`INSERT INTO t ${sql.values("t", [{ id: 2, doc: sql.json({ views: 5, ok: true }), optional: sql.json(null), items: sql.json([{ views: 6 }]), label: sql.json("draft"), unshaped: sql.json({ anything: [true] }) }])}`,
).execute();
await sql(
	`INSERT INTO t (id, doc) VALUES (3, ${sql.json({ views: 7, ok: false })})`,
).execute();
await sql("INSERT INTO t (id, doc) VALUES ($1, $2)", 4, {
	views: 8,
	ok: true,
}).execute();
await sql("UPDATE t SET doc=:doc WHERE id=4", {
	doc: sql.json({ views: 9, ok: true }),
}).execute();
export const rows = await sql(
	"SELECT id, doc, doc -> 'views' AS views, optional -> 'views' AS optional, items -> 0 -> 'views' AS item, label, unshaped FROM t ORDER BY id",
).execute();
console.dir({ defaulted, inline, set, rows }, { depth: null });
await pool.end();
