import { MysqlClient } from "@effect/sql-mysql2";
import { type Col, type Json, mysqlDialect } from "@typesql/core/mysql";
import { createSql } from "@typesql/effect";
import { Effect, Redacted, Stream } from "effect";
import { SqlClient } from "effect/sql/SqlClient";

interface DB {
	users: {
		id: Col<"int">;
		display_name: Col<"varchar", { nullable: true }>;
		settings: Json<{ retry_count: number }>;
		active: Col<"tinyint">;
		balance: Col<"decimal">;
		visits: Col<"bigint">;
		avatar: Col<"blob", { nullable: true }>;
		created_at: Col<"datetime">;
	};
}

const sql = createSql<DB>(mysqlDialect);

const program = Effect.gen(function* () {
	const client = yield* SqlClient;
	yield* client.unsafe(
		"CREATE TABLE users (id int PRIMARY KEY, display_name varchar(64), settings json NOT NULL, active tinyint NOT NULL, balance decimal(10, 2) NOT NULL, visits bigint NOT NULL, avatar blob, created_at datetime NOT NULL)",
	);

	const inserted = yield* sql(
		`INSERT INTO users ${sql.values("users", [
			{
				id: 1,
				display_name: null,
				settings: sql.json({ retry_count: 1 }),
				active: 1,
				balance: "1.25",
				visits: 9007199254740993n,
				avatar: new Uint8Array([1, 2]),
				created_at: new Date("2020-01-02T03:04:05Z"),
			},
			{
				id: 2,
				display_name: "Grace",
				settings: sql.json({ retry_count: 2 }),
				active: 0,
				balance: 2,
				visits: 2,
				avatar: null,
				created_at: "2021-01-02 03:04:05",
			},
		])}`,
	).executeCount();
	const rows = yield* sql(
		"SELECT id, display_name, settings, active, balance, visits, avatar, created_at FROM users ORDER BY id",
	);
	const first = yield* sql(
		`SELECT id, display_name FROM users WHERE id = ${sql.param(1)}`,
	).executeTakeFirstOrThrow();
	const updated = yield* sql(
		"UPDATE users SET display_name = 'Ada' WHERE id = :id",
		{ id: 1 },
	).executeCount();
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
			return yield* sql("SELECT display_name FROM users ORDER BY id");
		}),
	);

	// With a client, statements require nothing.
	const bound = createSql<DB>(mysqlDialect, client);
	const fromBound = yield* bound(
		"SELECT count(*) AS n, sum(balance) AS total FROM users",
	).executeTakeFirstOrThrow();

	return {
		inserted,
		rows,
		first,
		updated,
		streamed,
		aborted,
		inTransaction,
		fromBound,
	};
});

export const result = await Effect.runPromise(
	program.pipe(
		Effect.provide(
			MysqlClient.layer({
				url: Redacted.make(process.env.DATABASE_URL ?? ""),
			}),
		),
	),
);
console.dir(result, { depth: null });
