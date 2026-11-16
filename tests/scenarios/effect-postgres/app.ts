import { PgClient } from "@effect/sql-pg";
import { CasePlugin } from "@typesql/core/plugins";
import { type Col, type Json, postgresDialect } from "@typesql/core/postgres";
import { createSql } from "@typesql/effect";
import { Effect, Redacted, Stream } from "effect";
import { SqlClient } from "effect/sql/SqlClient";

interface DB {
	users: {
		id: Col<"int4">;
		display_name: Col<"text", { nullable: true }>;
		settings: Json<{ retry_count: number }>;
		tags: Col<"text[]">;
		external_id: Col<"uuid">;
		created_at: Col<"timestamptz">;
	};
}

// Without a client, statements run on the fiber's SqlClient.
const sql = createSql<DB>(postgresDialect);

const ada = "0b0e1a3c-58a4-4a7e-9d59-7a4f5d9a0001";
const grace = "0b0e1a3c-58a4-4a7e-9d59-7a4f5d9a0002";

const named = sql(
	"SELECT id, display_name FROM users WHERE display_name IS NOT NULL",
);

const program = Effect.gen(function* () {
	const client = yield* SqlClient;
	yield* client.unsafe(
		"CREATE TABLE users (id int PRIMARY KEY, display_name text, settings jsonb NOT NULL, tags text[] NOT NULL, external_id uuid NOT NULL, created_at timestamptz NOT NULL)",
	);

	// A statement is the Effect of its rows.
	yield* sql(
		`INSERT INTO users ${sql.values("users", [
			{
				id: 1,
				display_name: null,
				settings: sql.json({ retry_count: 1 }),
				tags: ["a", 'b "quoted"'],
				external_id: ada,
				created_at: new Date("2020-01-02T03:04:05Z"),
			},
			{
				id: 2,
				display_name: "Grace",
				settings: sql.json({ retry_count: 2 }),
				tags: [],
				external_id: grace,
				created_at: "2021-01-02T03:04:05Z",
			},
		])}`,
	);
	const rows = yield* sql(
		"SELECT id, display_name, settings, tags, created_at FROM users ORDER BY id",
	);

	const first = yield* sql(
		`SELECT id, display_name FROM users WHERE id = ${sql.param(1)}`,
	).executeTakeFirstOrThrow();
	const missing = yield* sql(
		"SELECT id FROM users WHERE id = $1",
		99,
	).executeTakeFirst();
	const noResult = yield* sql("SELECT id FROM users WHERE id = 99")
		.executeTakeFirstOrThrow()
		.pipe(
			Effect.as("found"),
			Effect.catchTag("NoResultError", (error) =>
				Effect.succeed(`${error._tag}: ${error.message}`),
			),
		);
	const updated = yield* sql(
		`UPDATE users SET display_name = 'Ada' WHERE id = ${sql.param(1)}`,
	).executeCount();

	// An array of strings is read as the parameter's type, here uuid[].
	const byExternalId = yield* sql(
		`SELECT id FROM users WHERE external_id = ANY(${sql.param([ada, grace])}) ORDER BY id`,
	);

	// A statement splices as a subquery, and pipes as an Effect.
	const spliced = yield* sql(`SELECT count(*) AS n FROM (${named}) AS t`);
	const names = yield* named.pipe(
		Effect.map((users) => users.map((user) => user.display_name)),
	);
	const streamed = yield* Stream.runCollect(
		sql("SELECT id FROM users ORDER BY id").stream(),
	);

	// A failed transaction rolls back; inside one, another is a savepoint.
	const aborted = yield* sql
		.withTransaction(
			Effect.gen(function* () {
				yield* sql("UPDATE users SET display_name = 'Linus'");
				return yield* Effect.fail("abort" as const);
			}),
		)
		.pipe(
			Effect.match({
				onFailure: (error) => (error === "abort" ? "rolled back" : "failed"),
				onSuccess: () => "committed",
			}),
		);
	const inTransaction = yield* sql.withTransaction(
		Effect.gen(function* () {
			yield* sql("UPDATE users SET display_name = 'Barbara' WHERE id = 1");
			yield* sql("UPDATE users SET display_name = 'Edsger'").pipe(
				Effect.andThen(Effect.fail("inner abort" as const)),
				sql.withTransaction,
				Effect.ignore,
			);
			return yield* sql("SELECT display_name FROM users ORDER BY id").execute();
		}),
	);

	const values = yield* sql(
		"SELECT 9007199254740993::int8 AS big, 1.25::numeric AS decimal, '\\x0102'::bytea AS bytes, '1 day 2 hours'::interval AS span, '2020-01-02'::date AS day, ARRAY[1, 2]::int8[] AS bigs, NULL::text AS absent",
	).executeTakeFirstOrThrow();

	// The values the driver reads are parameters too, arrays as their text.
	const roundTrip = yield* sql(
		"SELECT $1::interval AS span, $2::int8[] AS bigs, $3::timestamptz[] AS times",
		values.span,
		values.bigs,
		[new Date("2020-01-02T03:04:05Z"), null],
	).executeTakeFirstOrThrow();

	// Plugins apply to the rows of every way to run a statement.
	const camel = sql.withPlugin(new CasePlugin());
	const byName = camel.prepare(
		"SELECT display_name, external_id FROM users WHERE display_name = $1",
	);
	const camelCased = yield* camel.withTransaction(byName("Grace"));
	const camelStreamed = yield* Stream.runCollect(
		camel("SELECT display_name FROM users ORDER BY id").stream(),
	);

	// With a client, statements require nothing.
	const bound = createSql<DB>(postgresDialect, client);
	const fromBound = bound("SELECT count(*)::int4 AS n FROM users");

	return {
		rows,
		first,
		missing,
		noResult,
		updated,
		byExternalId,
		spliced,
		names,
		streamed,
		aborted,
		inTransaction,
		values,
		roundTrip,
		camelCased,
		camelStreamed,
		fromBound: yield* fromBound,
		statement: JSON.stringify(fromBound),
	};
});

export const result = await Effect.runPromise(
	program.pipe(
		Effect.provide(
			PgClient.layer({
				url: Redacted.make(process.env.DATABASE_URL ?? ""),
				// Rows keep the database's names: the client's own renaming is bypassed.
				transformResultNames: (name) => name.toUpperCase(),
			}),
		),
	),
);
console.dir(result, { depth: null });
