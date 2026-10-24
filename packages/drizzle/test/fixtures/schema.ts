import { relations, sql } from "drizzle-orm";
import {
	bigint,
	bigserial,
	bit,
	boolean,
	char,
	cidr,
	customType,
	date,
	doublePrecision,
	geometry,
	halfvec,
	index,
	inet,
	integer,
	interval,
	json,
	jsonb,
	line,
	macaddr,
	macaddr8,
	numeric,
	pgEnum,
	pgMaterializedView,
	pgSchema,
	pgSequence,
	pgTable,
	pgView,
	point,
	primaryKey,
	real,
	serial,
	smallint,
	smallserial,
	sparsevec,
	text,
	time,
	timestamp,
	uuid,
	varchar,
	vector,
} from "drizzle-orm/pg-core";
import { pgType } from "../../src/index.js";

export const mood = pgEnum("mood", ["happy", "sad"]);
export const role = pgEnum("role", {
	Admin: "admin",
	Member: "member",
} as const);
export const postStatus = pgEnum("post_status", [
	"draft",
	"published",
	"archived",
]);

const citext = customType<{ data: string }>({ dataType: () => "citext" });

export const users = pgTable("users", {
	id: serial().primaryKey(),
	email: varchar({ length: 255 }).notNull().unique(),
	handle: pgType(citext("handle").notNull(), "text"),
	displayName: text("display_name"),
	mood: mood(),
	role: role().notNull().default("member"),
	createdAt: pgType(
		timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		"timestamptz",
	),
});

export const posts = pgTable(
	"posts",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
		authorId: integer("author_id")
			.notNull()
			.references(() => users.id),
		title: text().notNull(),
		body: text(),
		status: postStatus().notNull().default("draft"),
		tags: text().array().notNull().default(sql`'{}'`),
		slug: text()
			.notNull()
			.$defaultFn(() => "slug"),
		titleLength: integer("title_length").generatedAlwaysAs(sql`length(title)`),
		publishedAt: timestamp("published_at", { mode: "string" }),
	},
	(t) => [index("posts_author_idx").on(t.authorId)],
);

export const postTags = pgTable(
	"post_tags",
	{
		postId: bigint("post_id", { mode: "bigint" }).notNull(),
		tag: text().notNull(),
	},
	(t) => [primaryKey({ columns: [t.postId, t.tag] })],
);

export const usersRelations = relations(users, ({ many }) => ({
	posts: many(posts),
}));
export const postsRelations = relations(posts, ({ one }) => ({
	author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));

export const kitchenSink = pgTable("kitchen_sink", {
	int2: smallint().notNull(),
	int4: integer().notNull(),
	int8Num: bigint("int8_num", { mode: "number" }).notNull(),
	int8Big: bigint("int8_big", { mode: "bigint" }).notNull(),
	serial2: smallserial(),
	serial4: serial(),
	serial8Num: bigserial("serial8_num", { mode: "number" }),
	serial8Big: bigserial("serial8_big", { mode: "bigint" }),
	identityByDefault: integer(
		"identity_by_default",
	).generatedByDefaultAsIdentity(),
	num: numeric({ precision: 10, scale: 2 }).notNull(),
	numNumber: numeric("num_number", { mode: "number" }).notNull(),
	numBigint: numeric("num_bigint", { mode: "bigint" }).notNull(),
	float4: real().notNull(),
	float8: doublePrecision().notNull(),
	flag: boolean().notNull().default(false),
	txt: text().notNull(),
	txtEnum: text("txt_enum", { enum: ["a", "b"] }).notNull(),
	vc: varchar({ length: 20 }).notNull(),
	ch: char({ length: 2 }).notNull(),
	uid: uuid().notNull().defaultRandom(),
	day: date().notNull(),
	dayDate: date("day_date", { mode: "date" }).notNull(),
	clock: time().notNull(),
	clockTz: pgType(time("clock_tz", { withTimezone: true }).notNull(), "timetz"),
	ts: timestamp().notNull(),
	tsString: timestamp("ts_string", { mode: "string" }).notNull(),
	dur: interval().notNull(),
	doc: json().notNull(),
	data: jsonb().$type<{ a: number }>().notNull(),
	ip: inet().notNull(),
	net: cidr().notNull(),
	mac: macaddr().notNull(),
	mac8: macaddr8().notNull(),
	pt: point().notNull(),
	ptXy: point("pt_xy", { mode: "xy" }).notNull(),
	ln: line().notNull(),
	lnAbc: line("ln_abc", { mode: "abc" }).notNull(),
	geo: geometry({ type: "point", srid: 4326 }).notNull(),
	embedding: vector({ dimensions: 3 }).notNull(),
	half: halfvec({ dimensions: 3 }).notNull(),
	sparse: sparsevec({ dimensions: 3 }).notNull(),
	bits: bit({ dimensions: 8 }).notNull(),
	custom: citext().notNull(),
	ints: integer().array().notNull(),
	matrix: doublePrecision().array().array().notNull(),
	moods: mood().array(),
	maybe: text(),
});

export const auth = pgSchema("auth");
export const accountType = auth.enum("account_type", ["password", "oauth"]);
export const accounts = auth.table("accounts", {
	id: uuid().primaryKey().defaultRandom(),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id),
	type: accountType().notNull(),
	expiresAt: timestamp("expires_at"),
});
export const authUsers = auth.table("users", {
	id: uuid().primaryKey(),
	email: text().notNull(),
});
export const idSeq = pgSequence("id_seq");

export const activeUsers = pgView("active_users").as((qb) =>
	qb
		.select({
			id: users.id,
			email: users.email,
			displayName: users.displayName,
			mood: users.mood,
		})
		.from(users)
		.where(sql`${users.mood} = 'happy'`),
);
export const postCounts = pgView("post_counts").as((qb) =>
	qb
		.select({ authorId: posts.authorId, n: sql<number>`count(*)`.as("n") })
		.from(posts)
		.groupBy(posts.authorId),
);
export const userStats = pgMaterializedView("user_stats", {
	userId: integer("user_id").notNull(),
	postCount: bigint("post_count", { mode: "number" }).notNull(),
	lastPost: timestamp("last_post"),
}).existing();

export const appName = "demo";
export function helper(): number {
	return 1;
}
