import { PgClient } from "@effect/sql-pg";
import { CasePlugin } from "@typesql/core/plugins";
import { type Col, postgresDialect } from "@typesql/core/postgres";
import {
	createSql,
	type EffectPgTypeMap,
	type EffectSql,
} from "@typesql/effect";
import { Effect, Redacted } from "effect";
import { SqlClient } from "effect/sql/SqlClient";

interface DB {
	users: {
		id: Col<"int4", { hasDefault: true }>;
		display_name: Col<"text", { nullable: true }>;
	};
}

// The camelCase `sql` the application passes around, its type written out.
type Sql = EffectSql<DB, EffectPgTypeMap, [CasePlugin], never>;

const bind = (client: SqlClient): Sql =>
	createSql<DB>(postgresDialect, client).withPlugin(new CasePlugin());

// A factory's `sql`, named by its return type in a callback.
const makeSql = (client: SqlClient) =>
	createSql<DB>(postgresDialect, client).withPlugin(new CasePlugin());
const withSql = <A, E>(
	client: SqlClient,
	body: (sql: ReturnType<typeof makeSql>) => Effect.Effect<A, E>,
) => body(makeSql(client));

// Statements on the fiber's client.
const onFiber: EffectSql<DB, EffectPgTypeMap, [CasePlugin]> = createSql<DB>(
	postgresDialect,
).withPlugin(new CasePlugin());

const program = Effect.gen(function* () {
	const client = yield* SqlClient;
	yield* client.unsafe(
		"CREATE TABLE users (id serial PRIMARY KEY, display_name text)",
	);

	const sql = bind(client);
	const inserted = yield* sql(
		`INSERT INTO users ${sql.values("users", [
			{ displayName: "Ada" },
			{ displayName: null },
		])}`,
	).executeCount();
	const rows = yield* sql("SELECT id, display_name FROM users ORDER BY id");

	const named = yield* withSql(client, (sql) =>
		sql(
			`SELECT display_name FROM users WHERE id = ${sql.param(1)}`,
		).executeTakeFirstOrThrow(),
	);

	const counted = yield* onFiber(
		"SELECT count(*) AS user_count FROM users",
	).executeTakeFirstOrThrow();

	return { inserted, rows, named, counted };
});

export const result = await Effect.runPromise(
	program.pipe(
		Effect.provide(
			PgClient.layer({ url: Redacted.make(process.env.DATABASE_URL ?? "") }),
		),
	),
);
console.dir(result, { depth: null });
