// TypeSQL with Prisma (@typesql/prisma). The typesql-prisma generator writes the DB interface below
// on every `prisma generate`, with the database's own names (@map), native types (@db.*) and
// defaults. Raw SQL then runs through your PrismaClient. Hover the results.
//
//   generator typesql {
//     provider = "typesql-prisma"
//     output   = "../src/db/typesql.ts"
//   }
import { createSql, type PrismaRawClient } from "@typesql/prisma";
import type { Col, Generated, Nullable } from "@typesql/core";

// src/db/typesql.ts, as generated
interface DB {
  /** Prisma model `User`. */
  users: {
    id: Generated<"int4">;
    email: Col<"varchar">;
    /** Prisma field `name`. */
    display_name: Nullable<"text">;
    role: Generated<"Role">;
    /** `@updatedAt`: set by Prisma Client, no database default. */
    updatedAt: Col<"timestamp">;
  };
  /** Prisma model `Post`. */
  posts: {
    id: Col<"uuid">;
    /** Prisma field `authorId`. */
    author_id: Col<"int4">;
    title: Col<"text">;
    views: Generated<"int8">;
  };
  $types: {
    Role: "ADMIN" | "USER";
  };
}

declare const prisma: PrismaRawClient; // your PrismaClient
const sql = createSql<DB>(prisma); // runs on $queryRawUnsafe, always with bind parameters

const admins = await sql(`SELECT id, display_name, "updatedAt" FROM users WHERE role = $1`, "ADMIN").execute();
//    ^?

// Rows are typed as $queryRaw returns them: int8 is bigint, numeric is Decimal.
const stats = await sql(`SELECT author_id, count(*) AS posts, sum(views) AS views FROM posts GROUP BY author_id`).execute();
//    ^?

const deleted = await sql.transaction((tx) => tx(`DELETE FROM posts WHERE author_id = $1`, 1).executeCount());
//    ^?

// posts.id is @default(uuid()): Prisma Client fills it in, Postgres does not.
sql(`INSERT INTO posts (author_id, title) VALUES ($1, $2)`, 1, "Hello"); // error: id has no database default
