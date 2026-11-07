import { createTransactionalSql } from "@typesql/core/adapter";
import {
	type Col,
	type DefaultTypeMap,
	type Json,
	type Postgres,
	postgres,
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
>(postgres, db, driverOf("postgres"));

await sql(
	`INSERT INTO users ${sql.values("users", [
		{ id: 1, display_name: null, settings: sql.json({ retry_count: 1 }) },
	])}`,
).execute();
export const rows = await sql(
	"SELECT id, display_name, settings FROM users",
).execute();

// A transaction, and a savepoint inside it that rolls back alone.
export const inTransaction = await sql.transaction(async (tx) => {
	await tx("UPDATE users SET display_name = 'Ada' WHERE id = 1").execute();
	await tx
		.transaction(async (inner) => {
			await inner("UPDATE users SET display_name = 'Grace'").execute();
			throw new Error("inner abort");
		})
		.catch((error: Error) => console.log(error.message));
	return tx("SELECT display_name FROM users").executeTakeFirstOrThrow();
});

// One the caller opened on Kysely takes a savepoint too.
await db.transaction().execute(async (trx) => {
	const onTrx = createTransactionalSql<
		Postgres,
		DB,
		DefaultTypeMap,
		KyselyExecutor
	>(postgres, trx, driverOf("postgres"));
	await onTrx
		.transaction(async (tx) => {
			await tx("UPDATE users SET display_name = 'Linus'").execute();
			throw new Error("savepoint abort");
		})
		.catch((error: Error) => console.log(error.message));
});
export const after = await sql("SELECT display_name FROM users").execute();

console.dir({ rows, inTransaction, after }, { depth: null });
await db.destroy();
