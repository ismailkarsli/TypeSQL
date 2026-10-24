import type { Decimal, JsonValue } from "@prisma/client/runtime/client";
import type {
	Col,
	Generated,
	Nullable,
	NullableGenerated,
	ParamsType,
	RowType,
	SqlError,
	Validate,
	View,
} from "@typesql/core";
import { expectTypeOf, test } from "vitest";
import {
	createSql,
	type FromPrisma,
	type PrismaTypeMap,
} from "../../src/index.js";
import type { Prisma } from "../fixtures/client/client.js";
import type { DB as Generated_DB } from "../fixtures/typesql.js";

type DB = FromPrisma<Prisma.TypeMap>;

test("models become tables keyed by model and field name; relation fields are skipped", () => {
	expectTypeOf<keyof DB>().toEqualTypeOf<
		| "User"
		| "Post"
		| "PostLabel"
		| "Account"
		| "Native"
		| "ActiveUser"
		| "$types"
	>();
	expectTypeOf<DB["User"]>().toEqualTypeOf<{
		id: Generated<"int4">;
		email: Col<"text">;
		name: Nullable<"text">;
		role: Generated<"Role">;
		roles: Nullable<"Role[]">;
		tags: Nullable<"text[]">;
		bigNum: Col<"int8">;
		ratio: Col<"float8">;
		price: Col<"numeric">;
		active: Generated<"bool">;
		data: Nullable<"jsonb">;
		avatar: Nullable<"bytea">;
		createdAt: Generated<"timestamp">;
		// Optional in Prisma's create input although the database has no default.
		updatedAt: Generated<"timestamp">;
	}>();
	expectTypeOf<DB["PostLabel"]>().toEqualTypeOf<{
		postId: Col<"text">;
		label: Col<"text">;
	}>();
});

test("Prisma scalars map to the PostgreSQL connector's default types", () => {
	expectTypeOf<DB["Post"]>().toEqualTypeOf<{
		id: Generated<"text">;
		title: Col<"text">;
		authorId: Col<"int4">;
		publishAt: Nullable<"timestamp">;
		day: Col<"timestamp">;
		views: Generated<"int4">;
		score: Col<"float8">;
		cost: Nullable<"numeric">;
		nick: Nullable<"text">;
		code: Col<"text">;
		meta: Col<"jsonb">;
		ints: Nullable<"int4[]">;
		slug: Generated<"text">;
	}>();
	expectTypeOf<DB["Account"]>().toEqualTypeOf<{
		id: Generated<"int8">;
		userId: Col<"int4">;
		status: Generated<"Status">;
		at: Col<"timestamp">;
		ip: Nullable<"text">;
		flag: Nullable<"text">;
	}>();
	expectTypeOf<DB["Native"]["bytes"]>().toEqualTypeOf<Col<"bytea">>();
	expectTypeOf<DB["Native"]["decimals"]>().toEqualTypeOf<
		Nullable<"numeric[]">
	>();
	expectTypeOf<DB["Native"]["stamps"]>().toEqualTypeOf<
		Nullable<"timestamp[]">
	>();
	expectTypeOf<DB["Native"]["nullableId"]>().toEqualTypeOf<Nullable<"int4">>();
});

test("enums go to $types with their Prisma values; views become View<...>", () => {
	expectTypeOf<DB["$types"]>().toEqualTypeOf<{
		Role: "ADMIN" | "USER" | "GUEST";
		Status: "ACTIVE" | "BANNED";
	}>();
	expectTypeOf<DB["ActiveUser"]>().toEqualTypeOf<
		View<{ id: Col<"int4">; email: Col<"text">; name: Nullable<"text"> }>
	>();
});

/** The overrides that reproduce what the generator reads from `@map`, `@@map`, `@db.*`, `@@schema`. */
type Mapped = FromPrisma<
	Prisma.TypeMap,
	{
		User: {
			email: "varchar";
			name: { column: "display_name" };
			createdAt: { column: "created_at" };
			updatedAt: { default: false };
		};
		Post: {
			$table: "posts";
			id: { type: "uuid"; default: false };
			authorId: { column: "author_id" };
			publishAt: "timestamptz";
			day: "date";
			views: "int2";
			score: "float4";
			cost: "money";
			code: "bpchar";
			meta: "json";
		};
		PostLabel: { postId: "uuid" };
		Account: {
			$table: "accounts";
			$schema: "auth";
			userId: { column: "user_id" };
			at: "time";
			ip: "inet";
			flag: "bit";
		};
		ActiveUser: { $table: "active_users"; name: { column: "display_name" } };
		Native: { stamps: "timestamptz" };
		$types: { Role: "ADMIN" | "USER" | "guest" };
	}
>;

test("overrides rename tables and columns, pin types, defaults and schemas", () => {
	expectTypeOf<keyof Mapped>().toEqualTypeOf<
		| "User"
		| "posts"
		| "PostLabel"
		| "Native"
		| "active_users"
		| "auth"
		| "$types"
	>();
	expectTypeOf<Mapped["User"]>().toEqualTypeOf<Generated_DB["User"]>();
	expectTypeOf<Mapped["posts"]>().toEqualTypeOf<Generated_DB["posts"]>();
	expectTypeOf<Mapped["PostLabel"]>().toEqualTypeOf<
		Generated_DB["PostLabel"]
	>();
	expectTypeOf<Mapped["active_users"]>().toEqualTypeOf<
		Generated_DB["active_users"]
	>();
	expectTypeOf<Mapped["Native"]["stamps"]>().toEqualTypeOf<
		Nullable<"timestamptz[]">
	>();
	// The enum keeps its Prisma name (`Status`), so only the type of `status` differs.
	expectTypeOf<Omit<Mapped["auth"]["accounts"], "status">>().toEqualTypeOf<
		Omit<Generated_DB["auth"]["accounts"], "status">
	>();
	expectTypeOf<Mapped["$types"]>().toEqualTypeOf<{
		Role: "ADMIN" | "USER" | "guest";
		Status: "ACTIVE" | "BANNED";
	}>();
	expectTypeOf<
		FromPrisma<
			Prisma.TypeMap,
			{ Native: { nullableId: { nullable: false } } }
		>["Native"]["nullableId"]
	>().toEqualTypeOf<Generated<"int4">>();
	expectTypeOf<
		FromPrisma<
			Prisma.TypeMap,
			{ Native: { labels: { default: true } } }
		>["Native"]["labels"]
	>().toEqualTypeOf<NullableGenerated<"text[]">>();
});

test("overrides are checked against the models", () => {
	// @ts-expect-error unknown model
	type _A = FromPrisma<Prisma.TypeMap, { Nope: { $table: "x" } }>;
	// @ts-expect-error a field override is a type name or an object
	type _B = FromPrisma<Prisma.TypeMap, { User: { email: 1 } }>;
	type _C = FromPrisma<
		Prisma.TypeMap,
		// @ts-expect-error unknown field, next to a valid one
		{ User: { email: "varchar"; emial: "varchar" } }
	>;
	type _D = FromPrisma<
		Prisma.TypeMap,
		// @ts-expect-error unknown model, next to a valid one
		{ User: { $table: "users" }; Usr: { $table: "x" } }
	>;
	// @ts-expect-error misspelled model option
	type _E = FromPrisma<Prisma.TypeMap, { User: { $tabel: "users" } }>;
});

const sql = createSql<Prisma.TypeMap>();

test("createSql accepts Prisma.TypeMap; model names are case-sensitive identifiers", () => {
	const q = sql(
		'SELECT id, email, name, "bigNum", price, avatar, data, role, roles, "createdAt" FROM "User" WHERE id = $1',
		1,
	);
	expectTypeOf<RowType<typeof q>>().toEqualTypeOf<{
		id: number;
		email: string;
		name: string | null;
		bigNum: bigint;
		price: Decimal;
		avatar: Uint8Array | null;
		data: JsonValue | null;
		role: "ADMIN" | "USER" | "GUEST";
		roles: ("ADMIN" | "USER" | "GUEST")[] | null;
		createdAt: Date;
	}>();
	expectTypeOf<ParamsType<typeof q>>().toEqualTypeOf<[number | null]>();
	// Unquoted identifiers fold to lower case, so `User` and `bigNum` must be quoted.
	// (`FROM User` is `FROM CURRENT_USER`, whose one column is named "user")
	expectTypeOf<Validate<DB, "SELECT id FROM User">>().toEqualTypeOf<
		SqlError<'column "id" does not exist', 1>
	>();
	expectTypeOf<Validate<DB, 'SELECT bigNum FROM "User"'>>().toEqualTypeOf<
		SqlError<
			'column "bignum" does not exist. Perhaps you meant the column "bigNum"?',
			1
		>
	>();
});

test("INSERT requires NOT NULL columns without a default; views are read-only", () => {
	const ins = sql(
		'INSERT INTO "User" (email, "bigNum", ratio, price) VALUES ($1, $2, $3, $4) RETURNING id, "createdAt"',
		"a@b.c",
		1n,
		1.5,
		{} as Decimal,
	);
	expectTypeOf<RowType<typeof ins>>().toEqualTypeOf<{
		id: number;
		createdAt: Date;
	}>();
	expectTypeOf<
		Validate<DB, 'INSERT INTO "User" (email) VALUES ($1)'>
	>().toEqualTypeOf<
		SqlError<
			'null value in column "ratio" of relation "User" violates not-null constraint',
			2
		>
	>();
	expectTypeOf<
		Validate<DB, 'INSERT INTO "ActiveUser" (id, email) VALUES (1, $1)'>
	>().toEqualTypeOf<SqlError<'cannot insert into view "ActiveUser"', 2>>();
});

test("PrismaTypeMap is the default; another type map can be passed", () => {
	expectTypeOf(sql).toEqualTypeOf<
		ReturnType<typeof createSql<FromPrisma<Prisma.TypeMap>, PrismaTypeMap>>
	>();
	const pg = createSql<Prisma.TypeMap, { int8: string; int4: number }>();
	expectTypeOf<
		RowType<ReturnType<typeof pg<'SELECT "bigNum" FROM "User"'>>>
	>().toEqualTypeOf<{ bigNum: string }>();
});
