import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { sqlite } from "@typesql/core/sqlite";
import { createSql } from "@typesql/prisma";
import { PrismaClient } from "./generated/client/client.js";

const adapter = new PrismaBetterSqlite3({
	url: `file:${process.env.SQLITE_PATH}`,
});
const client = new PrismaClient({ adapter });

import type { DB } from "./generated/schema.js";

const sql = createSql<DB>(sqlite, client);
// Without a generated schema, the Prisma client's models are the tables.
const fromClient = createSql(sqlite, client);
await client.user.create({ data: { name: "Ada" } });
await client.author.create({ data: { name: "Ada" } });
export const rows = await sql(
	"SELECT id, name, display_name FROM users ORDER BY id",
).execute();
try {
	await sql.transaction(async (tx) => {
		await tx("DELETE FROM users WHERE id = $1", 1).execute();
		throw new Error("abort");
	});
} catch (error) {
	console.log(error instanceof Error ? error.message : error);
}
export const after = await sql("SELECT id FROM users ORDER BY id").execute();
export const clientRows = await fromClient(
	'SELECT id, name, bio FROM "Author" ORDER BY id',
).execute();
console.log({ rows, after });
console.log({ clientRows });
await client.$disconnect();
