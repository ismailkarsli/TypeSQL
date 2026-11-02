import postgres from "postgres";
import { createSql } from "@typesql/postgres";
import type { Col } from "@typesql/core/postgres";
interface DB {
	users: { id: Col<"int4">; name: Col<"text", { nullable: true }> };
}
const client = postgres(process.env.DATABASE_URL!);
await client.unsafe(
	"CREATE TABLE users (id int PRIMARY KEY, name text); INSERT INTO users VALUES (1, 'Ada'), (2, NULL)",
);
const sql = createSql<DB>(client);
const find = sql.prepare("SELECT id, name FROM users WHERE id = $1");
export const rows = await find(1).execute();
try {
	await sql.transaction(async (tx) => {
		await tx("DELETE FROM users WHERE id = $1", 2).execute();
		throw new Error("abort");
	});
} catch (error) {
	console.log((error as Error).message);
}
export const after = await sql(
	"SELECT id, name FROM users ORDER BY id",
).execute();
const big = createSql<{}>(client);
export const values = await big(
	"SELECT 9007199254740993::int8 AS big, '2020-01-02T03:04:05Z'::timestamptz AS at",
).execute();
console.log({ rows, after });
await client.end();
const bigintClient = postgres(process.env.DATABASE_URL!, {
	types: { bigint: postgres.BigInt },
});
export const bigRows = await createSql<{}>(bigintClient, { bigint: true })(
	"SELECT 9007199254740993::int8 AS big",
).execute();
console.log({ values, bigRows });
await bigintClient.end();
