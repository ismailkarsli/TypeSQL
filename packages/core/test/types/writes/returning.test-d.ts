import { expectTypeOf, test } from "vitest";
import type {
	Col,
	DefaultTypeMap,
	Generated,
	Nullable,
	RowOf,
	SqlError,
	Validate,
} from "../../../src/index.js";

interface DB {
	users: {
		id: Generated<"int4">;
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
	/** No column name overlaps with `posts`: `RETURNING *` over both is unambiguous. */
	tags: {
		tag_id: Generated<"int4">;
		post_id: Col<"int8">;
		label: Col<"text">;
	};
}

type Row<Q extends string> = RowOf<DB, DefaultTypeMap, Q>;
type V<Q extends string> = Validate<DB, Q>;

test("RETURNING * expands the target table when there is no FROM/USING", () => {
	type Users = {
		id: number;
		email: string;
		display_name: string | null;
		created_at: Date;
	};
	expectTypeOf<
		Row<"INSERT INTO users (email) VALUES ('a') RETURNING *">
	>().toEqualTypeOf<Users>();
	expectTypeOf<
		Row<"UPDATE users SET email = 'a' RETURNING *">
	>().toEqualTypeOf<Users>();
	expectTypeOf<Row<"DELETE FROM users RETURNING *">>().toEqualTypeOf<Users>();
	expectTypeOf<
		Row<"UPDATE users u SET email = 'a' RETURNING u.*">
	>().toEqualTypeOf<Users>();
});

test("RETURNING * with FROM/USING expands every item (Postgres behaviour)", () => {
	type Both = {
		id: string;
		author_id: number;
		title: string;
		body: string | null;
		tag_id: number;
		post_id: string;
		label: string;
	};
	expectTypeOf<
		Row<"UPDATE posts p SET title = t.label FROM tags t WHERE t.post_id = p.id RETURNING *">
	>().toEqualTypeOf<Both>();
	expectTypeOf<
		Row<"DELETE FROM posts p USING tags t WHERE t.post_id = p.id RETURNING *">
	>().toEqualTypeOf<Both>();
	expectTypeOf<
		Row<"UPDATE posts p SET title = t.label FROM tags t WHERE t.post_id = p.id RETURNING p.*, t.label">
	>().toEqualTypeOf<{
		id: string;
		author_id: number;
		title: string;
		body: string | null;
		label: string;
	}>();
	expectTypeOf<
		Row<"DELETE FROM posts p USING tags t WHERE t.post_id = p.id RETURNING t.*">
	>().toEqualTypeOf<{ tag_id: number; post_id: string; label: string }>();
});

test("RETURNING expressions follow Postgres column naming", () => {
	expectTypeOf<
		Row<"INSERT INTO users (email) VALUES ('a') RETURNING id::text, lower(email), email || 'x', 1 AS one, CASE WHEN id > 1 THEN 'a' END">
	>().toEqualTypeOf<{
		id: string;
		lower: string;
		"?column?": string;
		one: number;
		case: string | null;
	}>();
	expectTypeOf<
		Row<"UPDATE users SET email = 'a' RETURNING coalesce(display_name, email) AS name, display_name IS NULL AS anon, created_at::date">
	>().toEqualTypeOf<{ name: string; anon: boolean; created_at: Date }>();
	expectTypeOf<
		Row<"DELETE FROM posts RETURNING id, (SELECT email FROM users WHERE users.id = posts.author_id) AS author">
	>().toEqualTypeOf<{ id: string; author: string | null }>();
	expectTypeOf<
		Row<"INSERT INTO users (email) VALUES ('a') RETURNING $1::text AS tag, id">
	>().toEqualTypeOf<{ tag: string; id: number }>();
	// a string literal is text
	expectTypeOf<
		Row<"DELETE FROM users RETURNING 'a' AS a, id">
	>().toEqualTypeOf<{ a: string; id: number }>();
});

test("RETURNING scope errors", () => {
	expectTypeOf<
		V<"INSERT INTO users (email) VALUES ('a') RETURNING nope">
	>().toEqualTypeOf<SqlError<'column "nope" does not exist', 11>>();
	expectTypeOf<
		V<"INSERT INTO users AS u (email) VALUES ('a') RETURNING users.id">
	>().toEqualTypeOf<
		SqlError<'missing FROM-clause entry for table "users"', 2>
	>();
	expectTypeOf<
		V<"UPDATE users SET email = 'a' RETURNING p.title">
	>().toEqualTypeOf<SqlError<'missing FROM-clause entry for table "p"', 7>>();
	expectTypeOf<
		V<"DELETE FROM posts p USING tags t WHERE t.post_id = p.id RETURNING x.*">
	>().toEqualTypeOf<SqlError<'missing FROM-clause entry for table "x"', 16>>();
});

test("DML RETURNING feeds later CTEs and the main query", () => {
	expectTypeOf<
		Row<"WITH t AS (INSERT INTO tags (post_id, label) VALUES (1, 'x') RETURNING *) SELECT t.tag_id, t.label, p.title FROM t JOIN posts p ON p.id = t.post_id">
	>().toEqualTypeOf<{ tag_id: number; label: string; title: string }>();
	expectTypeOf<
		Row<"WITH moved AS (DELETE FROM tags RETURNING post_id, label) INSERT INTO tags (post_id, label) SELECT post_id, label FROM moved RETURNING tag_id">
	>().toEqualTypeOf<{ tag_id: number }>();
	expectTypeOf<
		Row<"WITH u AS (UPDATE users SET email = 'a' RETURNING id) SELECT count(*) AS n FROM u">
	>().toEqualTypeOf<{ n: string }>();
});
