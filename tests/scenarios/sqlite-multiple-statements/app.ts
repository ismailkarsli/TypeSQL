import { DatabaseSync } from "node:sqlite";
import { createSql } from "@typesql/sqlite";

const db = new DatabaseSync(process.env.SQLITE_PATH!);
const sql = createSql<{}>(db);

// One statement each.
await sql.as("CREATE TABLE notes (id integer PRIMARY KEY, body text);").exec();
await sql
	.as(
		"CREATE TRIGGER shout AFTER INSERT ON notes BEGIN UPDATE notes SET body = upper(body) WHERE id = new.id; END",
	)
	.exec();
await sql.as("INSERT INTO notes VALUES (1, 'one'); -- the first note").exec();
await sql.as("SELECT 1 AS \"a;b\", 2 AS [c;d], 3 AS `e;f`, 'g;h'").exec();

// Two statements: rejected.
const script: string = [
	"INSERT INTO notes VALUES (2, 'two')",
	"DELETE FROM notes WHERE id = 1",
].join("; ");
for (const run of [
	() => sql.as(script).exec(),
	() => sql.as(script).execCount(),
])
	try {
		await run();
	} catch (error) {
		console.log(error instanceof Error ? error.message : error);
	}

export const rows = await sql
	.as<{ id: number; body: string }>("SELECT id, body FROM notes ORDER BY id")
	.exec();
console.log(rows);
db.close();
