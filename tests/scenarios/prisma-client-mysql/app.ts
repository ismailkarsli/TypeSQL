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
const sql = createSql(mysql, client);
await client.user.create({ data: { name: "Ada" } });
export const rows = await sql(
	"SELECT id, name, bio FROM User ORDER BY id",
).execute();
try {
	await sql.transaction(async (tx) => {
		await tx("DELETE FROM User WHERE id = $1", 1).execute();
		throw new Error("abort");
	});
} catch (error) {
	console.log(error instanceof Error ? error.message : error);
}
export const after = await sql("SELECT id FROM User ORDER BY id").execute();
console.log({ rows, after });
await client.$disconnect();
