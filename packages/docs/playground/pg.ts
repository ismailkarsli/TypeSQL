// TypeSQL with node-postgres (@typesql/pg). Queries run on your Pool, and rows are typed by what
// pg's default parsers return: int8 and numeric as strings, timestamps as Date. Hover the results.
import { Pool } from "pg";
import { createSql } from "@typesql/pg";
import type { Col, Generated, Nullable } from "@typesql/core";

// Write this by hand, or generate it from your database: `typesql introspect --url … --out schema.ts`
interface DB {
  users: {
    id: Generated<"int4">;
    email: Col<"text">;
    display_name: Nullable<"text">;
    balance: Col<"numeric">;
    created_at: Generated<"timestamptz">;
  };
  posts: {
    id: Generated<"int8">;
    author_id: Col<"int4">;
    title: Col<"text">;
    published_at: Nullable<"timestamptz">;
  };
}

const pool = new Pool({ connectionString: "postgres://localhost/app" });
const sql = createSql<DB>(pool);

const byAuthor = sql(`SELECT p.id, p.title, p.published_at, u.email
                      FROM posts p JOIN users u ON u.id = p.author_id
                      WHERE p.author_id = $1`, 7);
const posts = await byAuthor.execute();
//    ^?

const user = await sql(`SELECT id, balance, created_at FROM users WHERE email = $1`, "ada@example.com").executeTakeFirstOrThrow();
//    ^?

const counts = await sql(`SELECT author_id, count(*) AS n FROM posts GROUP BY author_id`).execute();
//    ^?

// tx is sql bound to one transaction: COMMIT when the function resolves, ROLLBACK when it throws.
const postId = await sql.transaction(async (tx) => {
  //  ^?
  const { id } = await tx(`INSERT INTO users (email, balance) VALUES ($1, $2) RETURNING id`, "grace@example.com", 0).executeTakeFirstOrThrow();
  const post = await tx(`INSERT INTO posts (author_id, title) VALUES ($1, $2) RETURNING id`, id, "Hello").executeTakeFirstOrThrow();
  return post.id;
});

// Parameters are checked against their column: author_id is int4.
await sql(`DELETE FROM posts WHERE author_id = $1`, "7").execute(); // error: a string is not an int4
