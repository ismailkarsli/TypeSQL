import { expectTypeOf, test } from "vitest";
import type { Decimal } from "@prisma/client/runtime/client";
import type { Col, DefaultTypeMap, Generated, Nullable, NullableGenerated, RowOf, RowType, SqlError, Validate } from "@typesql/core";
import type { DB } from "../fixtures/typesql.js";
import { createSql } from "../../src/index.js";

// `fixtures/typesql.ts` is the output of the typesql-prisma generator for `fixtures/schema.prisma`.

const sql = createSql<DB>();

test("database names, native types and defaults come from the DMMF", () => {
  expectTypeOf<DB["User"]["email"]>().toEqualTypeOf<Col<"varchar">>();
  expectTypeOf<DB["User"]["display_name"]>().toEqualTypeOf<Nullable<"text">>();
  expectTypeOf<DB["User"]["updatedAt"]>().toEqualTypeOf<Col<"timestamp">>();
  expectTypeOf<DB["posts"]["id"]>().toEqualTypeOf<Col<"uuid">>();
  expectTypeOf<DB["posts"]["slug"]>().toEqualTypeOf<Generated<"text">>();
  expectTypeOf<DB["Native"]["labels"]>().toEqualTypeOf<NullableGenerated<"text[]">>();
  expectTypeOf<DB["$types"]>().toEqualTypeOf<{ Role: "ADMIN" | "USER" | "guest"; account_status: "ACTIVE" | "BANNED" }>();
});

test("queries use database names; @@schema tables are schema-qualified", () => {
  const q = sql('SELECT u.id, u.display_name, a.status, a.id AS account_id, a.at FROM "User" u JOIN auth.accounts a ON a.user_id = u.id WHERE u.role = $1', "guest");
  expectTypeOf<RowType<typeof q>>().toEqualTypeOf<{
    id: number;
    display_name: string | null;
    status: "ACTIVE" | "BANNED";
    account_id: bigint;
    at: Date;
  }>();
  const p = sql("SELECT id, cost, views, code FROM posts WHERE author_id = :author", { author: 1 });
  expectTypeOf<RowType<typeof p>>().toEqualTypeOf<{ id: string; cost: Decimal | null; views: number; code: string }>();
  expectTypeOf<Validate<DB, "SELECT id FROM accounts">>().toExtend<SqlError<string, number>>();
  expectTypeOf<Validate<DB, 'SELECT name FROM "User"'>>().toExtend<SqlError<string, number>>();
});

test("INSERT needs client-side defaults and @updatedAt; views are read-only", () => {
  // `id` (`@default(uuid())`) and `updatedAt` have no database default: raw SQL must supply them.
  expectTypeOf<Validate<DB, "INSERT INTO posts (title, author_id, day, score, code, meta) VALUES ('t', 1, now(), 1, 'abc', '{}')">>()
    .toExtend<SqlError<string, number>>();
  expectTypeOf<Validate<DB, "INSERT INTO posts (id, title, author_id, day, score, code, meta) VALUES (gen_random_uuid(), 't', 1, now(), 1, 'abc', '{}')">>()
    .toEqualTypeOf<"INSERT INTO posts (id, title, author_id, day, score, code, meta) VALUES (gen_random_uuid(), 't', 1, now(), 1, 'abc', '{}')">();
  expectTypeOf<Validate<DB, 'INSERT INTO "User" (email, "bigNum", ratio, price) VALUES ($1, 1, 1, 1)'>>().toExtend<SqlError<string, number>>();
  expectTypeOf<Validate<DB, "INSERT INTO active_users (id, email) VALUES (1, 'a')">>().toExtend<SqlError<string, number>>();
  expectTypeOf<RowOf<DB, DefaultTypeMap, "SELECT * FROM active_users">>().toEqualTypeOf<{ id: number; email: string; display_name: string | null }>();
});
