import { createSql } from "@typesql/mysql";
import { createPool } from "mysql2/promise";

const pool = createPool({
	uri: process.env.DATABASE_URL!,
	multipleStatements: true,
});
const sql = createSql<{}>(pool);

// A script of several statements, which mysql2 runs with
// multipleStatements: its last statement's result stands for it.
const script: string = [
	"CREATE TABLE notes (id INT PRIMARY KEY, body VARCHAR(10) NOT NULL)",
	"INSERT INTO notes VALUES (1, 'one'), (2, 'two')",
	"SELECT id, body FROM notes ORDER BY id",
].join("; ");
export const rows = await sql
	.as<{ id: number; body: string }>(script)
	.execute();
export const changed = await sql
	.as("UPDATE notes SET body = UPPER(body); DELETE FROM notes WHERE id = 1")
	.executeCount();
console.log({ rows, changed });
await pool.end();
