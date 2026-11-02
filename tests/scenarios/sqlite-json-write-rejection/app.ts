import { DatabaseSync } from "node:sqlite";
import type { Json } from "@typesql/core/sqlite";
import { createSql } from "@typesql/sqlite";

interface DB {
	t: {
		doc: Json<{ views: number; ok: boolean }>;
		optional: Json<{ views: number; ok: boolean }, { nullable: true }>;
		label: Json<"draft" | "published">;
	};
}
const db = new DatabaseSync(":memory:");
const sql = createSql<DB>(db);

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
