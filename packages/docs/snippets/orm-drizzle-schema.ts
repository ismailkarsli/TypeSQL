// #region schema
// schema.ts: your Drizzle schema
import { relations, sql } from "drizzle-orm";
import {
	integer,
	pgEnum,
	pgSchema,
	pgTable,
	pgView,
	serial,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

export const mood = pgEnum("mood", ["happy", "sad"]);

export const users = pgTable("users", {
	id: serial().primaryKey(),
	email: text().notNull(),
	displayName: text("display_name"),
	mood: mood(),
});

export const posts = pgTable("posts", {
	id: serial().primaryKey(),
	authorId: integer("author_id")
		.notNull()
		.references(() => users.id),
	title: text().notNull(),
	slug: text()
		.notNull()
		.$defaultFn(() => crypto.randomUUID()),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auth = pgSchema("auth");
export const sessions = auth.table("sessions", {
	id: uuid().primaryKey().defaultRandom(),
	userId: integer("user_id").notNull(),
});

export const happyUsers = pgView("happy_users").as((qb) =>
	qb
		.select({ id: users.id, email: users.email })
		.from(users)
		.where(sql`${users.mood} = 'happy'`),
);

export const usersRelations = relations(users, ({ many }) => ({
	posts: many(posts),
}));
// #endregion schema

// #region pgtype
import { pgType } from "@typesql/drizzle";

export const events = pgTable("events", {
	at: pgType(timestamp("at", { withTimezone: true }).notNull(), "timestamptz"),
});
// #endregion pgtype
