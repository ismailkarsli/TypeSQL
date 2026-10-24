// TypeSQL: Postgres SQL, parsed by TypeScript's type system. Edit the SQL and hover the types:
// rows and parameters follow, and mistakes are compile errors on the string.
import {
	type Col,
	createSql,
	type Generated,
	type Nullable,
	type ParamsType,
	type RowType,
} from "@typesql/core";

interface DB {
	users: {
		id: Generated<"int4">; // has a default: optional on INSERT
		email: Col<"text">;
		display_name: Nullable<"text">;
		created_at: Generated<"timestamptz">;
	};
	posts: {
		id: Generated<"int8">;
		author_id: Col<"int4">;
		title: Col<"text">;
		body: Nullable<"text">;
	};
}

const sql = createSql<DB>();

// LEFT JOIN makes the right side nullable; $1 takes its type from u.id.
const q = sql(
	`SELECT u.id, u.email, p.title
               FROM users u LEFT JOIN posts p ON p.author_id = u.id
               WHERE u.id = $1`,
	7,
);
type Row = RowType<typeof q>;
//   ^?
type Params = ParamsType<typeof q>;
//   ^?

// Aggregates and column names follow Postgres: count(*) is int8, a string under node-postgres.
const stats = sql(
	`SELECT author_id, count(*), max(title) AS latest FROM posts GROUP BY author_id`,
);
type Stats = RowType<typeof stats>;
//   ^?

// Inline values are sent as $n parameters and checked against where they are used.
const email = "ada@example.com";
const created = sql(
	`INSERT INTO users (email) VALUES (${sql.param(email)}) RETURNING id, created_at`,
);
type Created = RowType<typeof created>;
//   ^?

// Mistakes are compile errors on the SQL string. Fix them:
sql(`SELECT nme FROM users`); // error: column "nme" does not exist
sql(`INSERT INTO posts (title) VALUES ($1)`, "Hello"); // error: author_id is NOT NULL and has no default
