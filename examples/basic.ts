/**
 * TypeSQL examples. Type-check this file with `tsc --noEmit -p examples/tsconfig.json` and hover
 * the results in your editor; nothing here needs a database.
 */
import { createSql, type Col, type Generated, type Nullable, type RowType, type ApplyDdl } from "@typesql/core";

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
    tags: Col<"text[]">;
  };
}

const sql = createSql<DB>();

// 1. Joins and nullability: LEFT JOIN makes the right side nullable.
export const q1 = sql(
  `SELECT u.id, u.email, p.title
   FROM users u LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.id = $1`,
  7,
);
export type Q1Row = RowType<typeof q1>; // { id: number; email: string; title: string | null }

// 2. Aggregates follow Postgres: count(*) is int8 (a string under pg), max() is nullable
//    without GROUP BY, non-null with it.
export const q2 = sql(`SELECT author_id, count(*) AS n, max(title) FROM posts GROUP BY author_id`);
export type Q2Row = RowType<typeof q2>; // { author_id: number; n: string; max: string }

// 3. Postgres column naming for unaliased expressions.
export const q3 = sql(`SELECT 1 + 1, lower(email), id::text, CASE WHEN id > 1 THEN 'a' END FROM users`);
export type Q3Row = RowType<typeof q3>; // { "?column?": number; lower: string; id: string; case: string | null }

// 4. Parameters are typed from context; named parameters are sugar for $n.
export const q4 = sql(`SELECT id FROM users WHERE email = :email AND id > :min`, { email: "a@b.c", min: 10 });

// 4b. Inline parameters: values written in place, sent as $n, checked against their context.
declare const email: string;
export const q4b = sql(`SELECT id, display_name FROM users WHERE email = ${sql.param(email)} AND id > ${sql.param(10)}`);
// q4b.text === "SELECT id, display_name FROM users WHERE email = $1 AND id > $2"
// sql(`SELECT id FROM users WHERE id = ${sql.param("10")}`);   // error: a string value cannot be used as int4 NOT NULL
// sql(`SELECT id FROM users WHERE email = '${email}'`);         // error: the SQL text is not a string literal …

// 5. Fragments are spliced into inference and renumbered at runtime.
const where = sql.fragment(`WHERE u.display_name IS NOT NULL AND u.id > $1`, 100);
export const q5 = sql(`SELECT u.id, u.display_name FROM users u {where} ORDER BY u.id`, { where });
// q5.text === "SELECT u.id, u.display_name FROM users u WHERE u.display_name IS NOT NULL AND u.id > $1 ORDER BY u.id"

// 6. DDL evolves the schema type.
export type DB2 = ApplyDdl<DB, `ALTER TABLE users ADD COLUMN age int NOT NULL DEFAULT 0`>;
const sql2 = createSql<DB2>();
export const q6 = sql2(`SELECT age FROM users`); // { age: number }

// 7. Mistakes are compile errors on the SQL text:
// sql(`SELECT nme FROM users`);           // SqlError<'column "nme" does not exist', 1>
// sql(`SELECT id FROM users WHERE id = $1`, "7");  // Argument of type 'string' is not assignable to 'number'

// 8. Escape hatch for SQL the engine cannot type.
export const q8 = sql.as<{ n: number }>(`SELECT 1 AS n FROM some_extension_function()`);
