import { createSql, type ParamsType, type RowType } from "@typesql/core";
import { type Col, postgres } from "@typesql/core/postgres";
import { type Col as SqliteCol, sqlite } from "@typesql/core/sqlite";

interface PgDB {
	users: {
		id: Col<"int4", { hasDefault: true }>;
		email: Col<"text">;
		display_name: Col<"text", { nullable: true }>;
	};
	posts: {
		id: Col<"int8", { hasDefault: true }>;
		author_id: Col<"int4">;
		title: Col<"text">;
	};
}

interface SqliteDB {
	users: {
		id: SqliteCol<"integer">;
		name: SqliteCol<"text">;
		bio: SqliteCol<"text", { nullable: true }>;
	};
}

const pg = createSql<PgDB>(postgres);
const lite = createSql<SqliteDB>(sqlite);

const authors = pg(
	`SELECT u.id, u.email, u.display_name, p.title
	 FROM users u LEFT JOIN posts p ON p.author_id = u.id
	 WHERE u.id = $1`,
	7,
);
export type PgRow = RowType<typeof authors>;
export type PgParams = ParamsType<typeof authors>;

const people = lite("SELECT id, name, bio FROM users WHERE id = :id", {
	id: 1,
});
export type SqliteRow = RowType<typeof people>;
