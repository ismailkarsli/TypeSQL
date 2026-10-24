/**
 * TypeSQL with a Prisma schema (@typesql/prisma). Type-checked by this package's
 * `pnpm typecheck`; hover the results in your editor. Nothing here needs a database.
 *
 * The `DB` interface below is what the typesql-prisma generator writes on `prisma generate`
 * for this schema:
 *
 *   generator typesql {
 *     provider = "typesql-prisma"
 *     output   = "../src/db/typesql.ts"
 *   }
 *
 *   enum Role {
 *     ADMIN
 *     USER
 *     GUEST @map("guest")
 *   }
 *
 *   model User {
 *     id        Int      @id @default(autoincrement())
 *     email     String   @unique @db.VarChar(200)
 *     name      String?  @map("display_name")
 *     role      Role     @default(USER)
 *     balance   Decimal  @default(0) @db.Decimal(10, 2)
 *     createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
 *     updatedAt DateTime @updatedAt
 *     posts     Post[]
 *     @@map("users")
 *   }
 *
 *   model Post {
 *     id       String @id @default(uuid()) @db.Uuid
 *     authorId Int    @map("author_id")
 *     author   User   @relation(fields: [authorId], references: [id])
 *     title    String
 *     views    BigInt @default(0)
 *     @@map("posts")
 *   }
 */
import type {
	Col,
	Generated,
	Nullable,
	ParamsType,
	RowType,
} from "@typesql/core";
import { createSql, type PrismaRawClient } from "@typesql/prisma";

// --- generated: src/db/typesql.ts ---
interface DB {
	/** Prisma model `User`. */
	users: {
		id: Generated<"int4">;
		email: Col<"varchar">;
		/** Prisma field `name`. */
		display_name: Nullable<"text">;
		role: Generated<"Role">;
		balance: Generated<"numeric">;
		/** Prisma field `createdAt`. */
		created_at: Generated<"timestamptz">;
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
		Role: "ADMIN" | "USER" | "guest";
	};
}
// --- end generated ---

// createSql from @typesql/prisma types rows as $queryRaw returns them (PrismaTypeMap), and runs
// the queries through Prisma Client.
declare const prisma: PrismaRawClient; // a PrismaClient, an extended client or a transaction client
const sql = createSql<DB>(prisma);

// 1. Tables and columns have their database names (@@map, @map). Enum values are the database
//    values, so `GUEST @map("guest")` is "guest".
export const q1 = sql(
	`SELECT id, display_name, role FROM users WHERE role = $1`,
	"guest",
);
export type Q1Row = RowType<typeof q1>; // { id: number; display_name: string | null; role: "ADMIN" | "USER" | "guest" }
export type Q1Params = ParamsType<typeof q1>; // ["ADMIN" | "USER" | "guest"]

// 2. Unmapped names keep Prisma's casing, and Postgres folds unquoted identifiers to lower case,
//    so they are quoted in SQL, as Postgres requires.
export const q2 = sql(`SELECT email, "updatedAt" FROM users WHERE id = $1`, 1);
export type Q2Row = RowType<typeof q2>; // { email: string; updatedAt: Date }
// sql(`SELECT updatedAt FROM users`);  // error: column "updatedat" does not exist

// 3. Prisma's raw results: int8 (and count(*)) is bigint, numeric is Decimal.
export const q3 = sql(
	`SELECT u.id, u.balance, count(p.id) AS posts, sum(p.views) AS views
   FROM users u LEFT JOIN posts p ON p.author_id = u.id
   GROUP BY u.id`,
);
export type Q3Row = RowType<typeof q3>; // { id: number; balance: Decimal; posts: bigint; views: Decimal | null }

// 4. Database defaults are optional in INSERT. Client-side defaults (`uuid()`, `cuid()`,
//    `@updatedAt`) are not database defaults, so raw INSERTs must supply them.
export const q4 = sql(
	`INSERT INTO users (email, "updatedAt") VALUES ($1, now()) RETURNING id, role, created_at`,
	"a@b.c",
);
export type Q4Row = RowType<typeof q4>; // { id: number; role: "ADMIN" | "USER" | "guest"; created_at: Date }
// sql(`INSERT INTO posts (author_id, title) VALUES ($1, $2)`, 1, "Hello");  // error: "id" is NOT NULL and has no default

// 5. Run queries with execute* ($queryRawUnsafe) and executeCount ($executeRawUnsafe). Values are
//    always sent as bind parameters. sql.transaction runs in an interactive prisma.$transaction.
export async function renameUser(id: number, name: string) {
	return sql.transaction(async (tx) => {
		const changed = await tx(
			`UPDATE users SET display_name = $2, "updatedAt" = now() WHERE id = $1`,
			id,
			name,
		).executeCount();
		// changed: number (affected rows)
		const rows = await tx(
			`SELECT id, display_name FROM users WHERE id = $1`,
			id,
		).execute();
		// rows: { id: number; display_name: string | null }[]
		return { changed, rows };
	});
}

// 6. Without the generator: convert the client Prisma already generates. Tables and columns are
//    then the model and field names, with the connector's default types (no @map, no @db.*)
//    unless you add overrides:
//
//   import type { FromPrisma } from "@typesql/prisma";
//   import type { Prisma } from "./generated/prisma/client";
//
//   const sql = createSql<Prisma.TypeMap>();
//   sql(`SELECT id, "createdAt" FROM "User"`);
//
//   type DB = FromPrisma<Prisma.TypeMap, {
//     User: { $table: "users"; name: { column: "display_name" }; email: "varchar"; updatedAt: { default: false } };
//   }>;
