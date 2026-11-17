import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { sqliteDialect } from "@typesql/core/sqlite";
import { createSql } from "@typesql/prisma";
import { PrismaClient } from "./generated/client/client.js";

const adapter = new PrismaBetterSqlite3({
	url: `file:${process.env.SQLITE_PATH}`,
});
const client = new PrismaClient({ adapter });

import type { DB } from "./generated/schema.js";

const sql = createSql<DB>(sqliteDialect, client);
// Without a generated schema, the Prisma client's models are the tables.
const fromClient = createSql(sqliteDialect, client);
await client.user.create({ data: { name: "Ada" } });
await client.author.create({ data: { name: "Ada" } });
export const rows = await sql(
	"SELECT id, name, display_name FROM users ORDER BY id",
).exec();
try {
	await sql.transaction(async (tx) => {
		await tx("DELETE FROM users WHERE id = $1", 1).exec();
		throw new Error("abort");
	});
} catch (error) {
	console.log(error instanceof Error ? error.message : error);
}
export const after = await sql("SELECT id FROM users ORDER BY id").exec();
export const clientRows = await fromClient(
	'SELECT id, name, bio FROM "Author" ORDER BY id',
).exec();
console.log({ rows, after });
console.log({ clientRows });
await client.$disconnect();
