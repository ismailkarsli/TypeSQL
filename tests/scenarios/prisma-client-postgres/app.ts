import { PrismaPg } from "@prisma/adapter-pg";
import { postgres } from "@typesql/core/postgres";
import { createSql } from "@typesql/prisma";
import { PrismaClient } from "./generated/client/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const client = new PrismaClient({ adapter });
const sql = createSql(postgres, client);
await client.user.create({ data: { name: "Ada" } });
export const rows = await sql(
	'SELECT id, name, bio FROM "User" ORDER BY id',
).execute();
try {
	await sql.transaction(async (tx) => {
		await tx('DELETE FROM "User" WHERE id = $1', 1).execute();
		throw new Error("abort");
	});
} catch (error) {
	console.log((error as Error).message);
}
export const after = await sql('SELECT id FROM "User" ORDER BY id').execute();
console.log({ rows, after });
await client.$disconnect();
