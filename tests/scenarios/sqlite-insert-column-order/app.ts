import { DatabaseSync } from "node:sqlite";
import {
	migration,
	type SchemaOf,
	type SqliteMigration,
} from "@typesql/core/migration";
import type { Col } from "@typesql/core/sqlite";
import { createSql } from "@typesql/sqlite";

// `items` is written by hand without positions, so its column order is
// unknown; `placed` has the positions `typesql introspect` writes.
interface DB {
	items: {
		sku: Col<"integer">;
		name: Col<"text">;
		note: Col<"text", { nullable: true }>;
	};
	placed: {
		sku: Col<"integer", { position: 0 }>;
		name: Col<"text", { position: 1 }>;
		note: Col<"text", { nullable: true; position: 2 }>;
	};
}
const databasePath = process.env.SQLITE_PATH;
if (!databasePath) throw new Error("Missing SQLITE_PATH");
const db = new DatabaseSync(databasePath);
db.exec(`CREATE TABLE items (sku integer PRIMARY KEY, name text NOT NULL, note text);
  CREATE TABLE placed (sku integer PRIMARY KEY, name text NOT NULL, note text);`);
const sql = createSql<DB>(db);

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

const baseline = {
	up: async (db: SqliteMigration<DB>) => db,
	down: async () => {},
};
const tagged = migration(baseline, {
	up: async (db) =>
		db.ddl(
			"ALTER TABLE items ADD COLUMN tag text; ALTER TABLE placed ADD COLUMN tag text",
		),
	down: async () => {},
});
db.exec(
	"ALTER TABLE items ADD COLUMN tag text; ALTER TABLE placed ADD COLUMN tag text",
);
const altered = createSql<SchemaOf<typeof tagged>>(db);

const added = altered.prepare("INSERT INTO items VALUES (5, $1, $2, $3)");
export type AddedParams = Parameters<typeof added>;
await added("Edsger", null, "new").execute();

const appended = altered.prepare("INSERT INTO placed VALUES ($1, $2, $3, $4)");
export type AppendedParams = Parameters<typeof appended>;
await appended(2, "Grace", "SQL", "new").execute();

export const items = await altered(
	"SELECT sku, name, note, tag FROM items ORDER BY sku",
).execute();
export const placed = await altered(
	"SELECT sku, name, note, tag FROM placed ORDER BY sku",
).execute();
console.log({ items, placed });
db.close();
