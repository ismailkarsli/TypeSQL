import type { Col, Sig } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	app: {
		users: { id: Col<"int4">; name: Col<"text"> };
	};
	$functions: {
		// Functions declared under their schema-qualified names.
		"app.user_count": Sig<[], "int8", { nullable: false }>;
		"app.user_by_id": Sig<["int4"], "app.users">;
		"app.user_cards": Sig<
			[],
			"record",
			{ srf: true; columns: { id: Col<"int4">; card: "text" } }
		>;
		// One name in two schemas, with different return types.
		"app.label": Sig<["int4"], "text">;
		"audit.label": Sig<["int4"], "int4">;
		// A bare key still matches a qualified call.
		greet: Sig<["text"], "text">;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);
await pool.query(`
	CREATE SCHEMA app;
	CREATE SCHEMA audit;
	CREATE TABLE app.users (id integer NOT NULL, name text NOT NULL);
	INSERT INTO app.users VALUES (1, 'ada'), (2, 'alan');
	CREATE FUNCTION app.user_count() RETURNS bigint
		LANGUAGE sql AS $$ SELECT count(*) FROM app.users $$;
	CREATE FUNCTION app.user_by_id(uid integer) RETURNS app.users
		LANGUAGE sql AS $$ SELECT * FROM app.users WHERE id = uid $$;
	CREATE FUNCTION app.user_cards() RETURNS TABLE (id integer, card text)
		LANGUAGE sql AS $$ SELECT id, 'user ' || name FROM app.users ORDER BY id $$;
	CREATE FUNCTION app.label(n integer) RETURNS text
		LANGUAGE sql AS $$ SELECT 'label ' || n $$;
	CREATE FUNCTION audit.label(n integer) RETURNS integer
		LANGUAGE sql AS $$ SELECT n * 10 $$;
	CREATE FUNCTION app.greet(name text) RETURNS text
		LANGUAGE sql AS $$ SELECT 'hello ' || name $$;
`);

export const counted = await sql("SELECT app.user_count() AS n").exec();
export const byId = await sql(
	`SELECT u.id, u.name FROM app.user_by_id(${sql.param(2)}) u`,
).exec();
export const cards = await sql("SELECT * FROM app.user_cards() c").exec();
export const labels = await sql(
	`SELECT app.label(${sql.param(3)}) AS app_label, audit.label(${sql.param(3)}) AS audit_label`,
).exec();
export const greeting = await sql(
	`SELECT app.greet(${sql.param("grace")}) AS g`,
).exec();

console.dir({ counted, byId, cards, labels, greeting }, { depth: null });
await pool.end();
