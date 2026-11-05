import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { mysql } from "@typesql/core/mysql";
import { createSql } from "@typesql/prisma";
import { PrismaClient } from "./generated/client/client.js";

const url = new URL(process.env.DATABASE_URL!);
const adapter = new PrismaMariaDb({
	host: url.hostname,
	port: Number(url.port),
	user: url.username,
	password: url.password,
	database: url.pathname.slice(1),
	connectionLimit: 5,
});
const client = new PrismaClient({ adapter });

import type { DB } from "./generated/schema.js";

const sql = createSql<DB>(mysql, client);
await client.user.create({ data: { name: "Ada", big: 9007199254740993n } });
export const rows = await sql(
	"SELECT id, name, display_name, role, balance, big FROM users ORDER BY id",
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
const prefs = await sql("SELECT prefs FROM users ORDER BY id").execute();
console.log({ rows, after, prefs });
await client.$disconnect();
