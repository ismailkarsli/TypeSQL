import { expectTypeOf, test } from "vitest";
import type { ColumnType, Generated as KGenerated, GeneratedAlways, JSONColumnType } from "kysely";
import type { Arr, Col, Generated, Nullable, NullableGenerated, View } from "@typesql/core";
import type { FromKysely, InferColumn, SnakeCase } from "../../src/index.js";
import type { DB, Interval, Json, Mood, Numeric, Point, Timestamp, Int8, ArrayType, Generated as CGenerated } from "../fixtures/kysely-codegen.js";

type Schema = FromKysely<DB>;

test("kysely-codegen tables convert column by column", () => {
  expectTypeOf<Schema["users"]>().toEqualTypeOf<{
    avatar: Nullable<"bytea">;
    balance: Col<"numeric">;
    created_at: Generated<"timestamptz">;
    display_name: Nullable<"text">;
    email: Col<"text">;
    id: Generated<"int4">;
    location: Nullable<"point">;
    mood: Nullable<"users.mood">;
    moods: Generated<"users.moods[]">;
    session_length: Nullable<"interval">;
  }>();
  expectTypeOf<Schema["posts"]>().toEqualTypeOf<{
    author_id: Col<"int4">;
    body: Nullable<"text">;
    edited_at: Nullable<"timestamptz[]">;
    id: Generated<"int8">;
    meta: Nullable<"jsonb">;
    published: Generated<"bool">;
    score: Nullable<"int4">;
    tags: Arr<"text">;
    title: Col<"text">;
    views: Generated<"int8">;
  }>();
});

test("schema-qualified keys become namespaces; enums are registered in $types", () => {
  expectTypeOf<keyof Schema>().toEqualTypeOf<"auth" | "posts" | "users" | "$types">();
  expectTypeOf<Schema["auth"]>().toEqualTypeOf<{
    sessions: { auth_user_id: Col<"text">; expires_at: Col<"timestamptz">; id: Generated<"int8"> };
    users: { id: Generated<"text">; role: Col<"auth.users.role">; user_id: Col<"int4"> };
  }>();
  expectTypeOf<Schema["$types"]>().toEqualTypeOf<{
    "users.mood": "happy" | "sad";
    "users.moods": "happy" | "sad";
    "auth.users.role": "admin" | "member";
  }>();
  type P = FromKysely<{ "public.users": { id: number }; "public.posts": { id: number } }>;
  expectTypeOf<P>().toEqualTypeOf<{ users: { id: Col<"int4"> }; posts: { id: Col<"int4"> }; $types: {} }>();
});

test("overrides: type names, descriptors, enum names, views", () => {
  type S = FromKysely<DB, {
    users: { id: "int8"; balance: { type: "float8"; nullable: true }; created_at: { hasDefault: false } };
    "auth.users": { id: "uuid"; role: "auth.role" };
    "auth.sessions": { auth_user_id: "uuid"; expires_at: "timestamp" };
    posts: { $view: true; score: "float8" };
    $types: { mood: Mood };
  }>;
  expectTypeOf<S["users"]["id"]>().toEqualTypeOf<Generated<"int8">>();
  expectTypeOf<S["users"]["balance"]>().toEqualTypeOf<Nullable<"float8">>();
  expectTypeOf<S["users"]["created_at"]>().toEqualTypeOf<Col<"timestamptz">>();
  // `$types` matches by value: both enum columns get the shared name
  expectTypeOf<S["users"]["mood"]>().toEqualTypeOf<Nullable<"mood">>();
  expectTypeOf<S["users"]["moods"]>().toEqualTypeOf<Generated<"mood[]">>();
  expectTypeOf<S["auth"]["users"]>().toEqualTypeOf<{ id: Generated<"uuid">; role: Col<"auth.role">; user_id: Col<"int4"> }>();
  expectTypeOf<S["auth"]["sessions"]>().toEqualTypeOf<{ auth_user_id: Col<"uuid">; expires_at: Col<"timestamp">; id: Generated<"int8"> }>();
  expectTypeOf<S["posts"]>().toExtend<View<{ readonly [c: string]: { readonly type: string; readonly nullable: boolean; readonly hasDefault: boolean } }>>();
  expectTypeOf<S["posts"]["$view"]["score"]>().toEqualTypeOf<Nullable<"float8">>();
  // an override naming a built-in type drops the union; a custom name registers it
  expectTypeOf<S["$types"]>().toEqualTypeOf<{ mood: "happy" | "sad"; "auth.role": "admin" | "member" }>();
  type T = FromKysely<DB, { users: { mood: "text"; moods: "feeling[]" } }>;
  expectTypeOf<T["users"]["mood"]>().toEqualTypeOf<Nullable<"text">>();
  expectTypeOf<T["$types"]>().toEqualTypeOf<{ feeling: "happy" | "sad"; "auth.users.role": "admin" | "member" }>();
});

test("ambiguous $types matches fall back to the derived name", () => {
  type S = FromKysely<{ t: { a: "x" | "y" } }, { $types: { one: "x" | "y"; two: "x" | "y" } }>;
  expectTypeOf<S["t"]["a"]>().toEqualTypeOf<Col<"t.a">>();
});

test("inference rules for single columns", () => {
  // plain TS types
  expectTypeOf<InferColumn<number>>().toEqualTypeOf<Col<"int4">>();
  expectTypeOf<InferColumn<string>>().toEqualTypeOf<Col<"text">>();
  expectTypeOf<InferColumn<boolean>>().toEqualTypeOf<Col<"bool">>();
  expectTypeOf<InferColumn<bigint>>().toEqualTypeOf<Col<"int8">>();
  expectTypeOf<InferColumn<Date | null>>().toEqualTypeOf<Nullable<"timestamptz">>();
  expectTypeOf<InferColumn<Buffer>>().toEqualTypeOf<Col<"bytea">>();
  expectTypeOf<InferColumn<Uint8Array>>().toEqualTypeOf<Col<"bytea">>();
  // `unknown` (prisma-kysely's Json) includes null, like `JsonValue`
  expectTypeOf<InferColumn<unknown>>().toEqualTypeOf<Nullable<"jsonb">>();
  expectTypeOf<InferColumn<{ a: number }>>().toEqualTypeOf<Col<"jsonb">>();
  expectTypeOf<InferColumn<number[]>>().toEqualTypeOf<Col<"int4[]">>();
  expectTypeOf<InferColumn<number[][]>>().toEqualTypeOf<Col<"int4[]">>();
  expectTypeOf<InferColumn<(string | null)[] | null>>().toEqualTypeOf<Nullable<"text[]">>();
  expectTypeOf<InferColumn<"a" | "b">>().toEqualTypeOf<Col<"enum">>();
  expectTypeOf<InferColumn<("a" | "b")[]>>().toEqualTypeOf<Col<"enum[]">>();
  // kysely-codegen helpers
  expectTypeOf<InferColumn<Int8>>().toEqualTypeOf<Col<"int8">>();
  expectTypeOf<InferColumn<Numeric | null>>().toEqualTypeOf<Nullable<"numeric">>();
  expectTypeOf<InferColumn<Timestamp>>().toEqualTypeOf<Col<"timestamptz">>();
  expectTypeOf<InferColumn<Interval>>().toEqualTypeOf<Col<"interval">>();
  expectTypeOf<InferColumn<Point>>().toEqualTypeOf<Col<"point">>();
  expectTypeOf<InferColumn<{ x: number; y: number; radius: number }>>().toEqualTypeOf<Col<"circle">>();
  // `JsonValue` includes null, so json columns are always nullable
  expectTypeOf<InferColumn<Json>>().toEqualTypeOf<Nullable<"jsonb">>();
  expectTypeOf<InferColumn<ArrayType<Int8>>>().toEqualTypeOf<Col<"int8[]">>();
  expectTypeOf<InferColumn<ArrayType<Timestamp> | null>>().toEqualTypeOf<Nullable<"timestamptz[]">>();
  expectTypeOf<InferColumn<CGenerated<Int8>>>().toEqualTypeOf<Generated<"int8">>();
  expectTypeOf<InferColumn<CGenerated<Timestamp | null>>>().toEqualTypeOf<NullableGenerated<"timestamptz">>();
  // kysely's own helpers
  expectTypeOf<InferColumn<KGenerated<number>>>().toEqualTypeOf<Generated<"int4">>();
  expectTypeOf<InferColumn<KGenerated<string | null>>>().toEqualTypeOf<NullableGenerated<"text">>();
  expectTypeOf<InferColumn<GeneratedAlways<number>>>().toEqualTypeOf<Generated<"int4">>();
  expectTypeOf<InferColumn<GeneratedAlways<Int8>>>().toEqualTypeOf<Generated<"int8">>();
  expectTypeOf<InferColumn<KGenerated<Int8>>>().toEqualTypeOf<Generated<"int8">>();
  expectTypeOf<InferColumn<JSONColumnType<{ a: number }>>>().toEqualTypeOf<Col<"jsonb">>();
  expectTypeOf<InferColumn<JSONColumnType<{ a: number } | null, string | null>>>().toEqualTypeOf<Nullable<"jsonb">>();
  expectTypeOf<InferColumn<ColumnType<Date, string, never>>>().toEqualTypeOf<Col<"timestamptz">>();
  // prisma-kysely style: enums as `(typeof Role)[keyof typeof Role]`, Decimal as string, Json as unknown
  const Role = { ADMIN: "ADMIN", USER: "USER" } as const;
  type Role = (typeof Role)[keyof typeof Role];
  expectTypeOf<InferColumn<KGenerated<Role>>>().toEqualTypeOf<Generated<"enum">>();
});

test("camelCase: keys map back to snake_case like CamelCasePlugin", () => {
  expectTypeOf<SnakeCase<"createdAt">>().toEqualTypeOf<"created_at">();
  expectTypeOf<SnakeCase<"userID">>().toEqualTypeOf<"user_id">();
  expectTypeOf<SnakeCase<"id">>().toEqualTypeOf<"id">();
  expectTypeOf<SnakeCase<"address2Line">>().toEqualTypeOf<"address2_line">();
  expectTypeOf<SnakeCase<"Foo">>().toEqualTypeOf<"foo">();
  interface CamelDB {
    "auth.userSessions": { userId: number; status: "on" | "off" };
    blogPosts: { authorId: number; createdAt: CGenerated<Timestamp> };
  }
  type S = FromKysely<CamelDB, { blogPosts: { authorId: "int8" } }, { camelCase: true }>;
  expectTypeOf<S>().toEqualTypeOf<{
    auth: { user_sessions: { user_id: Col<"int4">; status: Col<"auth.user_sessions.status"> } };
    blog_posts: { author_id: Col<"int8">; created_at: Generated<"timestamptz"> };
    $types: { "auth.user_sessions.status": "on" | "off" };
  }>();
});
