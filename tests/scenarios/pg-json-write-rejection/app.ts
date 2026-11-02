import type { Json } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	t: {
		doc: Json<{ views: number; ok: boolean }>;
		optional: Json<{ views: number; ok: boolean }, { nullable: true }, "json">;
		label: Json<"draft" | "published">;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);

sql(`UPDATE t SET doc=${sql.json({ views: "wrong", ok: true })}`);
sql(`UPDATE t SET doc=${sql.json({ ok: true })}`);
sql(
	`UPDATE t SET ${sql.set("t", { doc: sql.json({ views: "wrong", ok: true }) })}`,
);
sql(`UPDATE t SET ${sql.set("t", { doc: sql.json({ ok: true }) })}`);
sql(
	`INSERT INTO t ${sql.values("t", [{ doc: sql.json({ views: "wrong", ok: true }), label: sql.json("draft") }])}`,
);
sql(
	`INSERT INTO t ${sql.values("t", [{ doc: sql.json({ ok: true }), label: sql.json("draft") }])}`,
);
sql(
	`INSERT INTO t (doc, label) VALUES (${sql.json({ ok: true })}, ${sql.json("draft")})`,
);
sql(`UPDATE t SET optional=${sql.json({ views: "wrong", ok: true })}`);
sql(`UPDATE t SET optional=${sql.json({ ok: true })}`);
sql(`UPDATE t SET doc=${sql.json(null)}`);
sql(`UPDATE t SET label=${sql.json("wrong")}`);
