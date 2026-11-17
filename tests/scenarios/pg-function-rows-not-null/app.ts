import type { Col, Sig } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	users: {
		id: Col<"int4">;
		name: Col<"text">;
		bio: Col<"text", { nullable: true }>;
	};
	$functions: {
		// Inserts a user and returns its row, or raises: never NULL.
		create_user: Sig<["text"], "users", { nullable: false }>;
		// The same function, not declared as never NULL.
		create_user_maybe: Sig<["text"], "users">;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);
await pool.query(`
	CREATE TABLE users (id serial NOT NULL, name text NOT NULL, bio text);
	CREATE FUNCTION create_user(uname text) RETURNS users LANGUAGE plpgsql AS $$
	DECLARE u users;
	BEGIN
		INSERT INTO users (name) VALUES (uname) RETURNING * INTO u;
		RETURN u;
	END $$;
	CREATE FUNCTION create_user_maybe(uname text) RETURNS users
		LANGUAGE sql AS $$ SELECT create_user(uname) $$;
`);

// Declared never NULL: the row keeps the table's nullability.
export const created = await sql(
	`SELECT * FROM create_user(${sql.param("ada")}) u`,
).exec();
export const createdColumns = await sql(
	`SELECT u.id, u.bio FROM create_user(${sql.param("alan")}) AS u`,
).exec();
// Not declared: one row that may be all NULL, so every column is nullable.
export const maybe = await sql(
	`SELECT u.id, u.name FROM create_user_maybe(${sql.param("grace")}) u`,
).exec();

console.dir({ created, createdColumns, maybe }, { depth: null });
await pool.end();
