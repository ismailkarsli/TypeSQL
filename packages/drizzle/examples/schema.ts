/**
 * The Drizzle schema used by basic.ts: an ordinary Drizzle schema module. The only typesql
 * addition is `pgType`, which pins a type Drizzle's column types do not record.
 */
import { relations, sql } from "drizzle-orm";
import { bigint, integer, pgEnum, pgSchema, pgTable, pgView, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgType } from "@typesql/drizzle";

export const mood = pgEnum("mood", ["happy", "sad"]);

export const users = pgTable("users", {
  id: serial().primaryKey(),
  email: text().notNull().unique(),
  displayName: text("display_name"),
  mood: mood(),
  // `withTimezone` is not in Drizzle's types: without pgType this would be `timestamp`.
  createdAt: pgType(timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), "timestamptz"),
});

export const posts = pgTable("posts", {
  id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  authorId: integer("author_id").notNull().references(() => users.id),
  title: text().notNull(),
  tags: text().array().notNull().default(sql`'{}'`),
  // Filled in by Drizzle, not by Postgres: raw INSERTs must supply it.
  slug: text().notNull().$defaultFn(() => crypto.randomUUID()),
  publishedAt: timestamp("published_at"),
});

export const auth = pgSchema("auth");

export const sessions = auth.table("sessions", {
  id: uuid().primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
});

export const happyUsers = pgView("happy_users").as((qb) =>
  qb.select({ id: users.id, email: users.email }).from(users).where(sql`${users.mood} = 'happy'`),
);

export const usersRelations = relations(users, ({ many }) => ({ posts: many(posts) }));
