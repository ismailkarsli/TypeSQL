import type { ParamsType, RowType } from "@typesql/core";
import {
	type Col,
	type Generated,
	type Nullable,
	postgres,
} from "@typesql/core/postgres";
import { createSql, type PrismaRawClient } from "@typesql/prisma";

interface DB {
	users: {
		id: Generated<"int4">;
		email: Col<"varchar">;
		display_name: Nullable<"text">;
		role: Generated<"Role">;
		balance: Generated<"numeric">;
		created_at: Generated<"timestamptz">;
		updatedAt: Col<"timestamp">;
	};
	posts: {
		id: Col<"uuid">;
		author_id: Col<"int4">;
		title: Col<"text">;
		views: Generated<"int8">;
	};
	$types: {
		Role: "ADMIN" | "USER" | "guest";
	};
}

declare const prisma: PrismaRawClient;
const sql = createSql<DB>(postgres, prisma);

export const q1 = sql(
	`SELECT id, display_name, role FROM users WHERE role = $1`,
	"guest",
);
export type Q1Row = RowType<typeof q1>;
export type Q1Params = ParamsType<typeof q1>;

export const q2 = sql(`SELECT email, "updatedAt" FROM users WHERE id = $1`, 1);
export type Q2Row = RowType<typeof q2>;

export const q3 = sql(
	`SELECT u.id, u.balance, count(p.id) AS posts, sum(p.views) AS views
   FROM users u LEFT JOIN posts p ON p.author_id = u.id
   GROUP BY u.id`,
);
export type Q3Row = RowType<typeof q3>;

export const q4 = sql(
	`INSERT INTO users (email, "updatedAt") VALUES ($1, now()) RETURNING id, role, created_at`,
	"a@b.c",
);
export type Q4Row = RowType<typeof q4>;

export async function renameUser(id: number, name: string) {
	return sql.transaction(async (tx) => {
		const changed = await tx(
			`UPDATE users SET display_name = $2, "updatedAt" = now() WHERE id = $1`,
			id,
			name,
		).executeCount();
		const rows = await tx(
			`SELECT id, display_name FROM users WHERE id = $1`,
			id,
		).execute();
		return { changed, rows };
	});
}
