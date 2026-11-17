import { type Col, postgresDialect } from "@typesql/core/postgres";
import { createSql } from "@typesql/effect";
import { Effect } from "effect";

interface DB {
	users: { id: Col<"int4">; display_name: Col<"text", { nullable: true }> };
}

const sql = createSql<DB>(postgresDialect);
const users = sql("SELECT id FROM users");

// Statements are checked as on any other `sql`, a spliced one too.
sql("SELECT email FROM users");
sql("SELECT id FROM users WHERE id = $1", "one");
sql(`SELECT email FROM (${users}) AS u`);

// A statement is an Effect, not a Promise.
const awaited: Promise<{ id: number }[]> = users.exec();

// Without a client, a statement requires the SqlClient.
const run = Effect.runPromise(users);
void [awaited, run];
