import { expectTypeOf, test } from "vitest";
import { pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import type { DefaultTypeMap, ParamsType, RowType } from "@typesql/core";
import { createSql } from "../../src/index.js";
import type * as schema from "../fixtures/schema.js";

const sql = createSql<typeof schema>();

test("SELECT with JOIN: row and params", () => {
  const q = sql(
    "SELECT u.id, u.email, u.display_name, u.mood, p.title, p.tags, p.status FROM users u JOIN posts p ON p.author_id = u.id WHERE u.mood = $1 AND p.status = $2 AND p.id > $3",
    "happy",
    "published",
    "10",
  );
  expectTypeOf<RowType<typeof q>>().toEqualTypeOf<{
    id: number;
    email: string;
    display_name: string | null;
    mood: "happy" | "sad";
    title: string;
    tags: string[];
    status: "draft" | "published" | "archived";
  }>();
  expectTypeOf<ParamsType<typeof q>>().toEqualTypeOf<["happy" | "sad", "draft" | "published" | "archived", string]>();
  // @ts-expect-error not a value of the enum
  sql("SELECT id FROM users WHERE mood = $1", "angry");
});

test("INSERT omits defaulted columns", () => {
  const ins = sql("INSERT INTO users (email, handle) VALUES ($1, $2) RETURNING id, role, created_at", "a@b.c", "ab");
  expectTypeOf<RowType<typeof ins>>().toEqualTypeOf<{ id: number; role: "admin" | "member"; created_at: Date }>();
  expectTypeOf<ParamsType<typeof ins>>().toEqualTypeOf<[string, string]>();

  const post = sql("INSERT INTO posts (author_id, title, slug, status) VALUES ($1, $2, $3, $4) RETURNING id", 1, "t", "s", "draft");
  expectTypeOf<RowType<typeof post>>().toEqualTypeOf<{ id: string }>();

  // @ts-expect-error `handle` is NOT NULL without a default
  sql("INSERT INTO users (email) VALUES ($1)", "a@b.c");
  // @ts-expect-error `slug` has only a $defaultFn, which raw SQL does not run
  sql("INSERT INTO posts (author_id, title) VALUES ($1, $2)", 1, "t");
});

test("schemas, views, arrays and extension types", () => {
  const a = sql("SELECT a.id, a.type FROM auth.accounts a WHERE a.user_id = $1", 1);
  expectTypeOf<RowType<typeof a>>().toEqualTypeOf<{ id: string; type: "password" | "oauth" }>();

  const v = sql("SELECT id, email, mood FROM active_users WHERE id = $1", 1);
  expectTypeOf<RowType<typeof v>>().toEqualTypeOf<{ id: number; email: string; mood: "happy" | "sad" | null }>();
  // @ts-expect-error views are read-only
  sql("INSERT INTO active_users (email) VALUES ('x')");

  const k = sql("SELECT ints, matrix, moods, data, embedding FROM kitchen_sink");
  expectTypeOf<RowType<typeof k>>().toEqualTypeOf<{ ints: number[]; matrix: number[][]; moods: ("happy" | "sad")[] | null; data: unknown; embedding: unknown }>();
});

test("type map and options", () => {
  const events = pgTable("events", { id: serial().primaryKey(), createdAt: timestamp().notNull() });
  type Map = Omit<DefaultTypeMap, "timestamptz"> & { timestamptz: string };
  const esql = createSql<typeof events, Map, { casing: "snake_case"; timestamp: "timestamptz" }>();
  const q = esql("SELECT id, created_at FROM events WHERE created_at > $1", "2024-01-01");
  expectTypeOf<RowType<typeof q>>().toEqualTypeOf<{ id: number; created_at: string }>();
  expectTypeOf<ParamsType<typeof q>>().toEqualTypeOf<[string]>();
});
