import type { ParamsType, RowType, TextType } from "@typesql/core";
import { check, type Equal } from "./_check.js";
import { sql } from "./schema.js";
declare const userId: number;
declare const email: string;
declare const ids: number[];

// #region positional
const byId = sql("SELECT id, email FROM users WHERE id = $1 AND created_at > $2", 7, new Date());
// Query<{ id: number; email: string }, [number, Date]>
// #endregion positional
check<Equal<ParamsType<typeof byId>, [number, Date]>>();

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
// one parameter used twice: the IS NULL test makes $1 accept null
const optional = sql("SELECT id FROM users WHERE (:name::text IS NULL OR display_name = :name)", { name });
optional.text; // "SELECT id FROM users WHERE ($1::text IS NULL OR display_name = $1)"

// two inline values are two parameters, each checked on its own:
// sql(`SELECT id FROM users WHERE (${sql.param(name)}::text IS NULL OR display_name = ${sql.param(name)})`);
// … SqlError<"parameter $2: a string | null value cannot be used as text NOT NULL", 14>
// #endregion repeated
check<Equal<ParamsType<typeof optional>, [string | null]>>();
check<Equal<TextType<typeof optional>, "SELECT id FROM users WHERE ($1::text IS NULL OR display_name = $1)">>();

// #region contexts
sql("SELECT id FROM users WHERE id = ANY($1)", ids); // number[]
sql("SELECT id FROM users LIMIT $1 OFFSET $2", 10, 20); // number, number
sql("INSERT INTO users (email, display_name, mood) VALUES ($1, $2, $3)", "a@b.c", null, "happy"); // string, string | null, mood
sql("SELECT lower($1) AS l", "ABC"); // string, from lower(text)
sql("SELECT $1::int4 + 1 AS n", 41); // number, from the cast
sql("SELECT $1 AS anything", { any: "value" }); // no context: unknown
// #endregion contexts

// #region int8
// int8 parameters take the same TS type as int8 results: string under the pg type map
sql("SELECT id FROM posts WHERE id = $1", "42");
// compare with a number by casting the parameter
sql("SELECT author_id FROM posts GROUP BY author_id HAVING count(*) >= $1::int4", 3);
// #endregion int8

// #region constants
const table = "users";
const limit = 10;
const fromConsts = sql(`SELECT id FROM ${table} LIMIT ${limit}`);
fromConsts.text; // "SELECT id FROM users LIMIT 10"
// #endregion constants
check<Equal<TextType<typeof fromConsts>, "SELECT id FROM users LIMIT 10">>();
