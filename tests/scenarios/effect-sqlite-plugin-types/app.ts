import { SqliteClient } from "@effect/sql-sqlite-node";
import { CasePlugin } from "@typesql/core/plugins";
import {
	type Col,
	type DefaultTypeMap,
	sqliteDialect,
} from "@typesql/core/sqlite";
import { createSql, type EffectSqliteSql } from "@typesql/effect";
import { Effect } from "effect";
import { SqlClient } from "effect/sql/SqlClient";

interface DB {
	users: {
		id: Col<"integer", { hasDefault: true; rowid: true }>;
		display_name: Col<"text", { nullable: true }>;
	};
}

// The camelCase `sql` the application passes around, its type written out.
type Sql = EffectSqliteSql<DB, DefaultTypeMap, [CasePlugin], never>;

const bind = (client: SqlClient): Sql =>
	createSql<DB>(sqliteDialect, client).withPlugin(new CasePlugin());

// A factory's `sql`, named by its return type in a callback.
const makeSql = (client: SqlClient) =>
	createSql<DB>(sqliteDialect, client).withPlugin(new CasePlugin());
const withSql = <A, E>(
	client: SqlClient,
	body: (sql: ReturnType<typeof makeSql>) => Effect.Effect<A, E>,
) => body(makeSql(client));

// Statements on the fiber's client.
const onFiber: EffectSqliteSql<DB, DefaultTypeMap, [CasePlugin]> =
	createSql<DB>(sqliteDialect).withPlugin(new CasePlugin());

const program = Effect.gen(function* () {
	const client = yield* SqlClient;
	yield* client.unsafe(
		"CREATE TABLE users (id integer PRIMARY KEY, display_name text)",
	);

	const sql = bind(client);
	const inserted = yield* sql(
		`INSERT INTO users ${sql.values("users", [
			{ displayName: "Ada" },
			{ displayName: null },
		])}`,
	).execCount();
	const rows = yield* sql("SELECT id, display_name FROM users ORDER BY id");

	const named = yield* withSql(client, (sql) =>
		sql(
			`SELECT display_name FROM users WHERE id = ${sql.param(1)}`,
		).execTakeFirst(),
	);

	const counted = yield* onFiber(
		"SELECT count(*) AS user_count FROM users",
	).execTakeFirst();

	return { inserted, rows, named, counted };
});

export const result = await Effect.runPromise(
	program.pipe(
		Effect.provide(
			SqliteClient.layer({ filename: process.env.SQLITE_PATH ?? "" }),
		),
	),
);
console.dir(result, { depth: null });
