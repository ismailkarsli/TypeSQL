import { createSql } from "@typesql/pg";
import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const sql = createSql<{}>(client);

// A script of several statements, which node-postgres runs without
// parameters: its last statement's result stands for it.
const script: string = [
	"CREATE TABLE notes (id int PRIMARY KEY, body text NOT NULL)",
	"INSERT INTO notes VALUES (1, 'one'), (2, 'two')",
	"SELECT id, body FROM notes ORDER BY id",
].join("; ");
export const rows = await sql
	.as<{ id: number; body: string }>(script)
	.execute();
export const changed = await sql
	.as("UPDATE notes SET body = upper(body); DELETE FROM notes WHERE id = 1")
	.executeCount();
console.log({ rows, changed });
await client.end();
