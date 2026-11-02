import { PrismaClient } from "./generated/client/client.js";
import { createSql } from "@typesql/prisma";
import { sqlite } from "@typesql/core/sqlite";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
const adapter = new PrismaBetterSqlite3({
	url: `file:${process.env.SQLITE_PATH}`,
});
const client = new PrismaClient({ adapter });
import type { DB } from "./generated/schema.js";
const sql = createSql<DB>(sqlite, client);
await client.user.create({ data: { name: "Ada" } });
export const rows = await sql(
	"SELECT id, name, display_name FROM users ORDER BY id",
).execute();
try {
	await sql.transaction(async (tx) => {
		await tx("DELETE FROM users WHERE id = $1", 1).execute();
		throw new Error("abort");
	});
} catch (error) {
	console.log((error as Error).message);
}
export const after = await sql("SELECT id FROM users ORDER BY id").execute();
console.log({ rows, after });
await client.$disconnect();
