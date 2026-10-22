import type { ParamsType, RowType, TextType } from "@typesql/core";
import { check, type Equal } from "./_check.js";
import { sql } from "./schema.js";
declare const userId: number;
declare const email: string;
declare const ids: number[];

// #region positional
const byId = sql("SELECT id, email FROM users WHERE id = $1 AND created_at > $2", 7, new Date());
// Query<{ id: number; email: string }, [number | null, Date | string | null]>
// #endregion positional
check<Equal<ParamsType<typeof byId>, [number | null, Date | string | null]>>();

// #region named
const byEmail = sql("SELECT id FROM users WHERE email = :email OR display_name = :email", { email: "a@b.c" });
byEmail.text; // "SELECT id FROM users WHERE email = $1 OR display_name = $1"
// #endregion named
check<Equal<TextType<typeof byEmail>, "SELECT id FROM users WHERE email = $1 OR display_name = $1">>();

// #region inline
const inline = sql(`SELECT id, email FROM users WHERE id = ${sql.param(userId)} AND email <> ${sql.param(email)}`);
inline.text; // "SELECT id, email FROM users WHERE id = $1 AND email <> $2"
inline.values; // [userId, email]
// #endregion inline
check<Equal<RowType<typeof inline>, { id: number; email: string }>>();
check<Equal<TextType<typeof inline>, "SELECT id, email FROM users WHERE id = $1 AND email <> $2">>();

declare const name: string | null;
// #region repeated
// one parameter used twice, sent once
const optional = sql("SELECT id FROM users WHERE (:name::text IS NULL OR display_name = :name)", { name });
optional.text; // "SELECT id FROM users WHERE ($1::text IS NULL OR display_name = $1)"

// two inline values are two parameters, $1 and $2, each sent and checked on its own:
// sql(`SELECT id FROM users WHERE (${sql.param(name)}::text IS NULL OR display_name = ${sql.param(name)})`);
// #endregion repeated
check<Equal<ParamsType<typeof optional>, [string | null]>>();
check<Equal<TextType<typeof optional>, "SELECT id FROM users WHERE ($1::text IS NULL OR display_name = $1)">>();

// #region contexts
sql("SELECT id FROM users WHERE id = ANY($1)", ids); // (number | null)[] | null
sql("SELECT id FROM users LIMIT $1 OFFSET $2", 10, 20); // number | null, number | null (LIMIT NULL is no limit)
sql("INSERT INTO users (email, display_name, mood) VALUES ($1, $2, $3)", "a@b.c", null, "happy"); // string, string | null, mood
sql("SELECT lower($1) AS l", "ABC"); // string | null, from lower(text)
sql("SELECT $1::int4 + 1 AS n", 41); // number, from the cast
sql("SELECT $1 AS anything", { any: "value" }); // no context: unknown
sql("SELECT v FROM unnest($1::text[]) AS t(v)", ["a", null]); // (string | null)[] | null: elements accept null
// #endregion contexts

// #region inputs
// int8 rows are strings under the pg type map; int8 parameters take number | bigint | string
const post = sql("SELECT id FROM posts WHERE id = $1", 42); // [string | number | bigint | null]
sql("SELECT author_id FROM posts GROUP BY author_id HAVING count(*) >= $1", 3n);
// timestamptz rows are Date; timestamptz parameters take Date | string
sql("SELECT id FROM users WHERE created_at > $1", "2024-01-01T00:00:00Z");
// #endregion inputs
check<Equal<ParamsType<typeof post>, [string | number | bigint | null]>>();

// #region constants
const table = "users";
const limit = 10;
const fromConsts = sql(`SELECT id FROM ${table} LIMIT ${limit}`);
fromConsts.text; // "SELECT id FROM users LIMIT 10"
// #endregion constants
check<Equal<TextType<typeof fromConsts>, "SELECT id FROM users LIMIT 10">>();
