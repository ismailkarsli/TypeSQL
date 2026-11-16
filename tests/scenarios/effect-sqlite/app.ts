import { SqliteClient } from "@effect/sql-sqlite-node";
import { type Col, type Json, sqliteDialect } from "@typesql/core/sqlite";
import { createSql } from "@typesql/effect";
import { Effect } from "effect";
import { SqlClient } from "effect/sql/SqlClient";

interface DB {
	users: {
		id: Col<"integer", { hasDefault: true; rowid: true }>;
		display_name: Col<"text", { nullable: true }>;
		settings: Json<{ retry_count: number }>;
		active: Col<"boolean">;
		score: Col<"real">;
		avatar: Col<"blob", { nullable: true }>;
	};
}

const sql = createSql<DB>(sqliteDialect);

const program = Effect.gen(function* () {
	const client = yield* SqlClient;
	yield* client.unsafe(
		"CREATE TABLE users (id integer PRIMARY KEY, display_name text, settings text NOT NULL, active boolean NOT NULL, score real NOT NULL, avatar blob)",
	);

	const inserted = yield* sql(
		`INSERT INTO users ${sql.values("users", [
			{
				display_name: null,
				settings: sql.json({ retry_count: 1 }),
				active: 1,
				score: 1.5,
				avatar: new Uint8Array([1, 2]),
			},
			{
				display_name: "Grace",
				settings: sql.json({ retry_count: 2 }),
				active: 0,
				score: 2,
				avatar: null,
			},
		])}`,
	).executeCount();
	const rows = yield* sql(
		"SELECT id, display_name, settings, active, score, avatar FROM users ORDER BY id",
	);
	const first = yield* sql(
		`SELECT id, settings ->> 'retry_count' AS retries FROM users WHERE id = ${sql.param(1)} AND active = ${sql.param(1)}`,
	).executeTakeFirstOrThrow();
	const returned = yield* sql(
		"UPDATE users SET display_name = 'Ada' WHERE id = :id RETURNING id, display_name",
		{ id: 1 },
	).executeCount();

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
			return yield* sql("SELECT display_name FROM users ORDER BY id");
		}),
	);

	// With a client, statements require nothing.
	const bound = createSql<DB>(sqliteDialect, client);
	const fromBound = yield* bound(
		"SELECT count(*) AS n, sum(score) AS total FROM users",
	).executeTakeFirstOrThrow();

	return {
		inserted,
		rows,
		first,
		returned,
		aborted,
		inTransaction,
		fromBound,
	};
});

export const result = await Effect.runPromise(
	program.pipe(
		Effect.provide(
			SqliteClient.layer({ filename: process.env.SQLITE_PATH ?? "" }),
		),
	),
);
console.dir(result, { depth: null });
