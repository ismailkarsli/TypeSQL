import { createHash } from "node:crypto";
import { createMigrator } from "@typesql/core/migration";
import { executor } from "@typesql/pg";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;
const holder = new Client({ connectionString });
const client = new Client({ connectionString });
await holder.connect();
await client.connect();
try {
	// Another migrator holds the lock, keyed as the migration guide describes:
	// by the database, schema and history table.
	const place = await holder.query<{ database: string; schema: string }>(
		"SELECT current_database() AS database, current_schema() AS schema",
	);
	const { database, schema } = place.rows[0]!;
	const key = createHash("sha256")
		.update(JSON.stringify([database, schema, "schema_migrations"]))
		.digest()
		.readBigInt64BE(0);
	await holder.query("SELECT pg_advisory_lock($1::bigint)", [String(key)]);

	await client.query("SET lock_timeout = '100ms'");
	await createMigrator({
		dialect: "postgres",
		migrations: [],
		execute: executor(client),
	})
		.latest()
		.catch((error: Error) => console.log("migrator:", error.message));

	// The caller's connection must not be left in the migrator's transaction.
	const after = await client.query<{ ok: number }>("SELECT 1 AS ok").then(
		(result) => result.rows,
		(error: Error) => error.message,
	);
	console.log("next statement on the connection:", after);
} finally {
	await client.end();
	await holder.end();
}
