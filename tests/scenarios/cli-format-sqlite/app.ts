import { DatabaseSync } from "node:sqlite";
import { createSql } from "@typesql/sqlite";
import { count, type DB } from "./other.js";

const db = new DatabaseSync(process.env.SQLITE_PATH!);
db.exec(
	"CREATE TABLE items (id integer PRIMARY KEY, price integer NOT NULL, qty integer NOT NULL)",
);
const sql = createSql<DB>(db);
await sql("insert into items values (1, 3, 2), (2, 5, 1)").execute();

// SQLite names an unaliased column after its text, so that text stays as written.
export const rows = await sql(
	"select id, price*qty, cast(price as text) , qty  as   q from items where qty>0 order by id",
).execute();
// So does a fragment that may be spliced into a select list.
const total = sql.fragment("sum(price*qty)");
export const totals = await sql(`select ${total} from items`).execute();
export const both = await sql(
	`select ${total} as total from items where id in (select id from items where qty is not null)`,
).execute();
// An unaliased item written over lines keeps the lines of the whole text.
export const lines = await sql(`select id, price *
  qty from items where id = 1`).execute();
console.log({ rows, totals, both, lines, count: await count(db) });
db.close();
