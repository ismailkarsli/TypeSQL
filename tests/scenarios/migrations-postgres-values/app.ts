import {
	createMigrator,
	migration,
	type PostgresMigration,
} from "@typesql/core/migration";

// The migrator runs migrations on a `pg` client, so their rows are typed as
// node-postgres returns them.
const read = (db: PostgresMigration) =>
	db(
		`SELECT '\\x01'::bytea AS bytes, '{a,b}'::"char"[] AS chars, ROW(1, 'a') AS pair, pg_sleep(0) AS slept, '1 day'::interval AS span`,
	).executeTakeFirstOrThrow();
export type Read = Awaited<ReturnType<typeof read>>;

const first = migration("postgres", {
	name: "001-read",
	up: async (db) => {
		const row = await read(db);
		console.log({
			bytes: Buffer.isBuffer(row.bytes),
			chars: row.chars,
			pair: row.pair,
			slept: row.slept,
			span: row.span.toPostgres(),
		});
		return db;
	},
	down: async () => {},
});
await createMigrator({
	dialect: "postgres",
	url: process.env.DATABASE_URL,
	migrations: [first],
}).latest();
