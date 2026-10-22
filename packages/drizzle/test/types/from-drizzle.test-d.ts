import { expectTypeOf, test } from "vitest";
import { integer, pgTable, serial, text, time, timestamp } from "drizzle-orm/pg-core";
import type { Col, DefaultTypeMap, Generated, Nullable, NullableGenerated, ParamsOf, RowOf, SqlError, Validate } from "@typesql/core";
import type { FromDrizzle } from "../../src/index.js";
import type { ToCamelCase, ToSnakeCase } from "../../src/casing.js";
import type * as schema from "../fixtures/schema.js";

type DB = FromDrizzle<typeof schema>;

test("tables are keyed by SQL name, columns by SQL column name", () => {
  expectTypeOf<DB["users"]>().toEqualTypeOf<{
    id: Generated<"int4">;
    email: Col<"varchar">;
    handle: Col<"text">;
    display_name: Nullable<"text">;
    mood: Nullable<"mood">;
    role: Generated<"role">;
    created_at: Generated<"timestamptz">;
  }>();
  expectTypeOf<DB["post_tags"]>().toEqualTypeOf<{ post_id: Col<"int8">; tag: Col<"text"> }>();
});

test("defaults: SQL defaults, identity, generated columns; $defaultFn is client-side", () => {
  expectTypeOf<DB["posts"]>().toEqualTypeOf<{
    id: Generated<"int8">;
    author_id: Col<"int4">;
    title: Col<"text">;
    body: Nullable<"text">;
    status: Generated<"postStatus">;
    tags: Generated<"text[]">;
    slug: Col<"text">;
    title_length: NullableGenerated<"int4">;
    published_at: Nullable<"timestamp">;
  }>();
});

test("every pg-core column kind", () => {
  expectTypeOf<DB["kitchen_sink"]>().toEqualTypeOf<{
    int2: Col<"int2">;
    int4: Col<"int4">;
    int8_num: Col<"int8">;
    int8_big: Col<"int8">;
    serial2: Generated<"int2">;
    serial4: Generated<"int4">;
    serial8_num: Generated<"int8">;
    serial8_big: Generated<"int8">;
    identity_by_default: Generated<"int4">;
    num: Col<"numeric">;
    num_number: Col<"numeric">;
    num_bigint: Col<"numeric">;
    float4: Col<"float4">;
    float8: Col<"float8">;
    flag: Generated<"bool">;
    txt: Col<"text">;
    txt_enum: Col<"text">;
    vc: Col<"varchar">;
    ch: Col<"bpchar">;
    uid: Generated<"uuid">;
    day: Col<"date">;
    day_date: Col<"date">;
    clock: Col<"time">;
    clock_tz: Col<"timetz">;
    ts: Col<"timestamp">;
    ts_string: Col<"timestamp">;
    dur: Col<"interval">;
    doc: Col<"json">;
    data: Col<"jsonb">;
    ip: Col<"inet">;
    net: Col<"cidr">;
    mac: Col<"macaddr">;
    mac8: Col<"macaddr8">;
    pt: Col<"point">;
    pt_xy: Col<"point">;
    ln: Col<"line">;
    ln_abc: Col<"line">;
    geo: Col<"geometry">;
    embedding: Col<"vector">;
    half: Col<"halfvec">;
    sparse: Col<"sparsevec">;
    bits: Col<"bit">;
    custom: Col<"unknown">;
    ints: Col<"int4[]">;
    matrix: Col<"float8[][]">;
    moods: Nullable<"mood[]">;
    maybe: Nullable<"text">;
  }>();
});

test("pgSchema tables live in a namespace; enums are registered by export name", () => {
  expectTypeOf<DB["auth"]>().toEqualTypeOf<{
    accounts: { id: Generated<"uuid">; user_id: Col<"int4">; type: Col<"accountType">; expires_at: Nullable<"timestamp"> };
    users: { id: Col<"uuid">; email: Col<"text"> };
  }>();
  expectTypeOf<DB["$types"]>().toEqualTypeOf<{
    mood: "happy" | "sad";
    role: "admin" | "member";
    postStatus: "draft" | "published" | "archived";
    accountType: "password" | "oauth";
  }>();
});

test("views and materialized views; relations, sequences and other exports are ignored", () => {
  expectTypeOf<DB["active_users"]>().toEqualTypeOf<{
    readonly $view: { id: Col<"int4">; email: Col<"varchar">; display_name: Nullable<"text">; mood: Nullable<"mood"> };
  }>();
  expectTypeOf<DB["post_counts"]>().toEqualTypeOf<{ readonly $view: { author_id: Col<"int4">; n: Nullable<"unknown"> } }>();
  expectTypeOf<DB["user_stats"]>().toEqualTypeOf<{ readonly $view: { user_id: Col<"int4">; post_count: Col<"int8">; last_post: Nullable<"timestamp"> } }>();
  expectTypeOf<keyof DB>().toEqualTypeOf<
    "users" | "posts" | "post_tags" | "kitchen_sink" | "auth" | "active_users" | "post_counts" | "user_stats" | "$types"
  >();
});

const events = pgTable("events", {
  id: serial().primaryKey(),
  createdAt: timestamp().notNull(),
  startsAt: time(),
  userID: integer(),
  line2Text: text(),
  explicit_name: text("explicit_name"),
});

test("a single table or a record of tables", () => {
  expectTypeOf<FromDrizzle<typeof schema.postTags>>().toEqualTypeOf<{ post_tags: { post_id: Col<"int8">; tag: Col<"text"> } }>();
  // Without the enum exports, enum columns fall back to text.
  expectTypeOf<FromDrizzle<{ users: typeof schema.users; tags: typeof schema.postTags }>["users"]["mood"]>().toEqualTypeOf<Nullable<"text">>();
  expectTypeOf<keyof FromDrizzle<{ users: typeof schema.users; tags: typeof schema.postTags }>>().toEqualTypeOf<"users" | "post_tags">();
});

test("options: casing, timestamp and time defaults", () => {
  expectTypeOf<FromDrizzle<typeof events>>().toEqualTypeOf<{
    events: { id: Generated<"int4">; createdAt: Col<"timestamp">; startsAt: Nullable<"time">; userID: Nullable<"int4">; line2Text: Nullable<"text">; explicit_name: Nullable<"text"> };
  }>();
  expectTypeOf<FromDrizzle<typeof events, { casing: "snake_case"; timestamp: "timestamptz"; time: "timetz" }>>().toEqualTypeOf<{
    events: { id: Generated<"int4">; created_at: Col<"timestamptz">; starts_at: Nullable<"timetz">; user_id: Nullable<"int4">; line2_text: Nullable<"text">; explicit_name: Nullable<"text"> };
  }>();
  expectTypeOf<keyof FromDrizzle<typeof events, { casing: "camelCase" }>["events"]>().toEqualTypeOf<
    "id" | "createdAt" | "startsAt" | "userID" | "line2Text" | "explicitName"
  >();
});

test("casing matches Drizzle's word splitting", () => {
  expectTypeOf<ToSnakeCase<"displayName">>().toEqualTypeOf<"display_name">();
  expectTypeOf<ToSnakeCase<"HTTPServer">>().toEqualTypeOf<"http_server">();
  expectTypeOf<ToSnakeCase<"userID2fa">>().toEqualTypeOf<"user_id_2fa">();
  expectTypeOf<ToSnakeCase<"already_snake">>().toEqualTypeOf<"already_snake">();
  expectTypeOf<ToSnakeCase<"A1">>().toEqualTypeOf<"a_1">();
  expectTypeOf<ToCamelCase<"display_name">>().toEqualTypeOf<"displayName">();
  expectTypeOf<ToCamelCase<"HTTP_server">>().toEqualTypeOf<"httpServer">();
  expectTypeOf<ToCamelCase<"user_ID">>().toEqualTypeOf<"userID">();
});

test("the converted schema validates queries", () => {
  type V<Q extends string> = Validate<DB, Q>;
  type Row<Q extends string> = RowOf<DB, DefaultTypeMap, Q>;
  type Params<Q extends string> = ParamsOf<DB, DefaultTypeMap, Q>;
  expectTypeOf<V<"SELECT userId FROM posts">>().toEqualTypeOf<SqlError<'column "userid" does not exist', 1>>();
  expectTypeOf<V<"INSERT INTO users (email) VALUES ('a')">>().toEqualTypeOf<SqlError<'null value in column "handle" of relation "users" violates not-null constraint', 2>>();
  expectTypeOf<V<"INSERT INTO posts (author_id, title) VALUES (1, 't')">>().toEqualTypeOf<SqlError<'null value in column "slug" of relation "posts" violates not-null constraint', 2>>();
  expectTypeOf<V<"INSERT INTO active_users (email) VALUES ('x')">>().toEqualTypeOf<SqlError<'cannot insert into view "active_users"', 2>>();
  expectTypeOf<Row<"SELECT a.type, a.expires_at, u.email FROM auth.accounts a JOIN auth.users u ON u.id = a.id">>()
    .toEqualTypeOf<{ type: "password" | "oauth"; expires_at: Date | null; email: string }>();
  expectTypeOf<Params<"SELECT 1 FROM auth.accounts WHERE type = $1">>().toEqualTypeOf<["password" | "oauth" | null]>();
});
