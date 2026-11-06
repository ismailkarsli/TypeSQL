import {
	type MySqlMigration,
	migration,
	type SchemaOf,
} from "@typesql/core/migration";
import type { Col } from "@typesql/core/mysql";
import { createSql } from "@typesql/mysql";
import { createPool } from "mysql2/promise";

// `items` is written by hand without positions, so its column order is
// unknown; `placed` has the positions `typesql introspect` writes.
interface DB {
	items: {
		sku: Col<"int">;
		name: Col<"varchar">;
		note: Col<"varchar", { nullable: true }>;
	};
	placed: {
		sku: Col<"int", { position: 0 }>;
		name: Col<"varchar", { position: 1 }>;
		note: Col<"varchar", { nullable: true; position: 2 }>;
	};
}
const uri = process.env.DATABASE_URL;
if (!uri) throw new Error("Missing DATABASE_URL");
const pool = createPool({ uri, multipleStatements: true });
await pool.query(`CREATE TABLE items (sku INT PRIMARY KEY, name VARCHAR(20) NOT NULL, note VARCHAR(20));
  CREATE TABLE placed (sku INT PRIMARY KEY, name VARCHAR(20) NOT NULL, note VARCHAR(20));`);
const sql = createSql<DB>(pool);

const unordered = sql.prepare("INSERT INTO items VALUES (1, $1, $2)");
export type UnorderedParams = Parameters<typeof unordered>;
await unordered("Ada", null).execute();

const rows = sql.prepare("INSERT INTO items VALUES (2, $1, $2), (3, $3, $4)");
export type RowsParams = Parameters<typeof rows>;
await rows("Grace", "SQL", "Lin", null).execute();

const listed = sql.prepare(
	"INSERT INTO items (note, sku, name) VALUES ($1, $2, $3)",
);
export type ListedParams = Parameters<typeof listed>;
await listed(null, 4, "Ken").execute();

const positioned = sql.prepare("INSERT INTO placed VALUES ($1, $2, $3)");
export type PlacedParams = Parameters<typeof positioned>;
await positioned(1, "Ada", null).execute();

const upsert = sql.prepare(
	"INSERT INTO placed VALUES ($1, $2, $3) AS new(a, b, c) ON DUPLICATE KEY UPDATE note = COALESCE(new.c, $4)",
);
export type UpsertParams = Parameters<typeof upsert>;
await upsert(1, "Ada", null, "kept").execute();

const baseline = {
	up: async (db: MySqlMigration<DB>) => db,
	down: async () => {},
};
const tagged = migration(baseline, {
	up: async (db) =>
		db.ddl(
			"ALTER TABLE items ADD COLUMN tag VARCHAR(10) FIRST; ALTER TABLE placed ADD COLUMN tag VARCHAR(10) AFTER sku",
		),
	down: async () => {},
});
await pool.query(
	"ALTER TABLE items ADD COLUMN tag VARCHAR(10) FIRST; ALTER TABLE placed ADD COLUMN tag VARCHAR(10) AFTER sku",
);
const altered = createSql<SchemaOf<typeof tagged>>(pool);

const first = altered.prepare("INSERT INTO items VALUES ($1, 5, $2, $3)");
export type FirstParams = Parameters<typeof first>;
await first("new", "Edsger", null).execute();

const after = altered.prepare("INSERT INTO placed VALUES ($1, $2, $3, $4)");
export type AfterParams = Parameters<typeof after>;
await after(2, "new", "Grace", "SQL").execute();

export const items = await altered(
	"SELECT tag, sku, name, note FROM items ORDER BY sku",
).execute();
export const placed = await altered(
	"SELECT sku, tag, name, note FROM placed ORDER BY sku",
).execute();
console.log({ items, placed });
await pool.end();
