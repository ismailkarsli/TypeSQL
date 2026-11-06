import { createSql } from "@typesql/mysql/tidb";
import { createConnection, type RowDataPacket } from "mysql2/promise";

interface DB {
	notes: {
		k: import("@typesql/core/mysql").Col<"varchar">;
	};
}
const connection = await createConnection(process.env.DATABASE_URL!);
await connection.query("CREATE TABLE notes (k varchar(100) NOT NULL)");
await connection.query("INSERT INTO notes VALUES ('a'), ('b')");

// The real server behind the client's shape: the values reach it as literals.
const sql = createSql<DB>({
	execute: async (query) => {
		const [rows] = await connection.query<RowDataPacket[]>(query);
		return { rows, rowsAffected: rows.length };
	},
});
const attack = "x' OR 1=1 -- ";
const lookup = () => sql("SELECT k FROM notes WHERE k = $1", attack).execute();
const echo = (value: string) =>
	sql("SELECT $1 AS v", value)
		.execute()
		.then(([row]) => row?.v === value);

// A value can't end its string, whichever way the server reads backslashes.
console.log("default", await lookup());
for (const value of [
	`it's`,
	`say "hi"`,
	"back\\slash",
	"\\'",
	"tail\\",
	"a\nb",
])
	console.log(JSON.stringify(value), await echo(value));
await connection.query("SET sql_mode = 'NO_BACKSLASH_ESCAPES'");
console.log("NO_BACKSLASH_ESCAPES", await lookup());
await connection.end();
