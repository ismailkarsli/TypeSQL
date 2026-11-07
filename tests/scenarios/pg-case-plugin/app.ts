import { CasePlugin } from "@typesql/core/plugins";
import type { Col, Json } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

type Tree = { node_name: string; child_nodes: Tree[] };
interface DB {
	users: {
		id: Col<"int4">;
		display_name: Col<"text", { nullable: true }>;
		address_line_1: Col<"text", { nullable: true }>;
		point_x_y: Col<"int4", { nullable: true }>;
		created_at: Col<"timestamptz", { hasDefault: true }>;
		avatar_data: Col<"bytea", { nullable: true }>;
		profile: Json<{
			home_city: string;
			phone_number: string | null;
			nick_name?: string;
			past_cities: readonly { city_name: string }[];
		}>;
		extra_doc: Json<
			{ last_seen: string },
			{ nullable: true; hasDefault: true }
		>;
		family_tree: Json<Tree, { nullable: true }>;
		free_form: Col<"jsonb", { nullable: true }>;
	};
	accounts: {
		id: Col<"int4">;
		displayName: Col<"text", { nullable: true }>;
		HTTPCode: Col<"int4", { nullable: true }>;
		userID: Col<"int4", { nullable: true }>;
		Id: Col<"int4", { nullable: true }>;
		fooBAR: Col<"int4", { nullable: true }>;
		XMLHttpRequest: Col<"int4", { nullable: true }>;
		HTTP2Code: Col<"int4", { nullable: true }>;
		userIDs: Col<"int4", { nullable: true }>;
		lower_name: Col<"text", { nullable: true }>;
		settingsDoc: Json<
			{
				maxRetries: number;
				retryPolicy: { backoffMs: number | null };
				allowedHosts: readonly { hostName: string }[];
			},
			{ nullable: true }
		>;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(`CREATE TABLE users (
	id int PRIMARY KEY,
	display_name text,
	address_line_1 text,
	point_x_y int,
	created_at timestamptz NOT NULL DEFAULT '2026-01-02T03:04:05Z',
	avatar_data bytea,
	profile jsonb NOT NULL,
	extra_doc jsonb DEFAULT '{"last_seen":"default"}',
	family_tree jsonb,
	free_form jsonb
);
CREATE TABLE accounts (
	id int PRIMARY KEY,
	"displayName" text,
	"HTTPCode" int,
	"userID" int,
	"Id" int,
	"fooBAR" int,
	"XMLHttpRequest" int,
	"HTTP2Code" int,
	"userIDs" int,
	lower_name text,
	"settingsDoc" jsonb
)`);
const sql = createSql<DB>(pool);

// The default keeps JSON as stored.
const camel = sql.withPlugin(new CasePlugin());
await camel(
	`INSERT INTO users ${camel.values("users", [
		{
			id: 1,
			displayName: "Ada",
			address_line_1: "1 Main St",
			point_x_y: 7,
			avatarData: Buffer.from("ab"),
			profile: camel.json({
				home_city: "London",
				phone_number: null,
				past_cities: [{ city_name: "Paris" }],
			}),
		},
	])}`,
).execute();
export const camelFlat = await camel(
	"SELECT display_name, address_line_1, point_x_y, profile FROM users WHERE id = 1",
).executeTakeFirstOrThrow();

// nested: rows, sql.json(), sql.param() and plain write values all convert.
const camelNested = sql.withPlugin(new CasePlugin({ nested: "all" }));
export const camelNestedRead = await camelNested(
	"SELECT id, created_at, avatar_data, profile, extra_doc, free_form FROM users WHERE id = 1",
).executeTakeFirstOrThrow();
await camelNested(
	`INSERT INTO users ${camelNested.values("users", [
		{
			id: 2,
			profile: camelNested.json({
				homeCity: "Oslo",
				phoneNumber: "555",
				nickName: "Oz",
				pastCities: [{ cityName: "Rome" }],
			}),
			extraDoc: camelNested.json(undefined),
			familyTree: camelNested.json({
				nodeName: "root",
				childNodes: [{ nodeName: "leaf", childNodes: [] }],
			}),
			freeForm: camelNested.json({ someKey: [{ innerKey: 1 }] }),
		},
	])}`,
).execute();
await camelNested(
	`INSERT INTO users (id, profile, extra_doc) VALUES (3, ${camelNested.param({
		homeCity: "Rome",
		phoneNumber: null,
		pastCities: [],
	})}, ${camelNested.json(null)})`,
).execute();
await camelNested(
	`UPDATE users SET ${camelNested.set("users", {
		profile: {
			homeCity: "Lima",
			phoneNumber: null,
			pastCities: [{ cityName: "Quito" }],
		},
		extraDoc: { lastSeen: "today" },
	})} WHERE id = 3`,
).execute();
export const camelNestedOptional = await camelNested(
	`UPDATE users SET ${camelNested.set({
		displayName: camelNested.param(camelNested.optional(undefined)),
		freeForm: camelNested.json({ optKey: 1 }),
	})} WHERE id = 3 RETURNING free_form`,
).executeTakeFirstOrThrow();
// Parameters keep the names of the database, positional and named alike.
await camelNested("UPDATE users SET free_form = :doc WHERE id = 1", {
	doc: { named_key: 1, camelKey: 2 },
}).execute();
export const storedNamedParameter = await sql(
	"SELECT free_form FROM users WHERE id = 1",
).executeTakeFirstOrThrow();
await camelNested("UPDATE users SET free_form = $1 WHERE id = 1", {
	param_key: 1,
	camelKey: 2,
}).execute();
export const storedPositionalParameter = await sql(
	"SELECT free_form FROM users WHERE id = 1",
).executeTakeFirstOrThrow();
export const camelNestedRows = await camelNested(
	"SELECT id, profile, extra_doc, free_form FROM users ORDER BY id",
).execute();
// A recursive JSON type converts as far down as it is read.
const { familyTree } = await camelNested(
	"SELECT family_tree FROM users WHERE id = 2",
).executeTakeFirstOrThrow();
export const leafName = familyTree?.childNodes[0]?.nodeName;
export const camelNestedInTransaction = await camelNested.transaction((tx) =>
	tx("SELECT profile FROM users WHERE id = 2").executeTakeFirstOrThrow(),
);
export const storedUsers = await sql(
	"SELECT id, profile, extra_doc, family_tree ->> 'node_name' AS tree_root, free_form FROM users ORDER BY id",
).execute();

// to: snake_case names camelCase columns the other way round.
const snake = sql.withPlugin(new CasePlugin({ to: "snake_case" }));
await snake(
	`INSERT INTO accounts ${snake.values("accounts", [
		{
			id: 1,
			display_name: "Ada",
			HTTPCode: 200,
			userID: 1,
			Id: 2,
			fooBAR: 3,
			XMLHttpRequest: 4,
			HTTP2Code: 5,
			user_i_ds: 6,
			settings_doc: snake.json({
				maxRetries: 1,
				retryPolicy: { backoffMs: null },
				allowedHosts: [{ hostName: "a.test" }],
			}),
		},
	])}`,
).execute();
export const snakeFlat = await snake(
	`SELECT "displayName", "HTTPCode", "userID", "Id", "fooBAR", "XMLHttpRequest", "HTTP2Code", "userIDs", lower_name, "settingsDoc" FROM accounts`,
).executeTakeFirstOrThrow();
export const snakeUpdated = await snake(
	`UPDATE accounts SET ${snake.set("accounts", { display_name: "Grace" })} WHERE id = 1 RETURNING "displayName"`,
).executeTakeFirstOrThrow();

const snakeNested = sql.withPlugin(
	new CasePlugin({ to: "snake_case", nested: "all" }),
);
await snakeNested(
	`INSERT INTO accounts ${snakeNested.values("accounts", [
		{
			id: 2,
			settings_doc: snakeNested.json({
				max_retries: 2,
				retry_policy: { backoff_ms: 100 },
				allowed_hosts: [{ host_name: "b.test" }],
			}),
		},
	])}`,
).execute();
export const snakeNestedRows = await snakeNested(
	`SELECT id, "displayName", "settingsDoc" FROM accounts ORDER BY id`,
).execute();
export const storedAccounts = await sql(
	`SELECT id, "settingsDoc" FROM accounts ORDER BY id`,
).execute();

console.dir(
	{
		camelFlat,
		camelNestedRead,
		camelNestedOptional,
		storedNamedParameter,
		storedPositionalParameter,
		camelNestedRows,
		leafName,
		camelNestedInTransaction,
		storedUsers,
		snakeFlat,
		snakeUpdated,
		snakeNestedRows,
		storedAccounts,
	},
	{ depth: null },
);
await pool.end();
