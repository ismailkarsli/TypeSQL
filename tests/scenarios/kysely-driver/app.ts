import { createTransactionalSql } from "@typesql/core/adapter";
import {
	type Col,
	type DefaultTypeMap,
	type Json,
	type Postgres,
	postgresDialect,
} from "@typesql/core/postgres";
import { driverOf, type KyselyExecutor } from "@typesql/kysely";
import { CamelCasePlugin, Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

// A TypeSQL schema, as `typesql introspect` writes it, not a Kysely one.
interface DB {
	users: {
		id: Col<"int4">;
		display_name: Col<"text", { nullable: true }>;
		settings: Json<{ retry_count: number }>;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(
	"CREATE TABLE users (id int PRIMARY KEY, display_name text, settings jsonb NOT NULL)",
);
const db = new Kysely<object>({
	dialect: new PostgresDialect({ pool }),
	plugins: [new CamelCasePlugin()],
});

const sql = createTransactionalSql<
	Postgres,
	DB,
	DefaultTypeMap,
	KyselyExecutor
>(postgresDialect, db, driverOf("postgres"));

await sql(
	`INSERT INTO users ${sql.values("users", [
		{ id: 1, display_name: null, settings: sql.json({ retry_count: 1 }) },
	])}`,
).exec();
export const rows = await sql(
	"SELECT id, display_name, settings FROM users",
).exec();

// A transaction, and a savepoint inside it that rolls back alone.
export const inTransaction = await sql.transaction(async (tx) => {
	await tx("UPDATE users SET display_name = 'Ada' WHERE id = 1").exec();
	await tx
		.transaction(async (inner) => {
			await inner("UPDATE users SET display_name = 'Grace'").exec();
			throw new Error("inner abort");
		})
		.catch((error: Error) => console.log(error.message));
	return tx("SELECT display_name FROM users").execOne();
});

// One the caller opened on Kysely takes a savepoint too.
await db.transaction().execute(async (trx) => {
	const onTrx = createTransactionalSql<
		Postgres,
		DB,
		DefaultTypeMap,
		KyselyExecutor
	>(postgresDialect, trx, driverOf("postgres"));
	await onTrx
		.transaction(async (tx) => {
			await tx("UPDATE users SET display_name = 'Linus'").exec();
			throw new Error("savepoint abort");
		})
		.catch((error: Error) => console.log(error.message));
});
export const after = await sql("SELECT display_name FROM users").exec();

console.dir({ rows, inTransaction, after }, { depth: null });
await db.destroy();
