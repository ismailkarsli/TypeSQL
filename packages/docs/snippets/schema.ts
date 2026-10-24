import {
	type Col,
	createSql,
	type Enum,
	type Generated,
	type Nullable,
	type PgCatalog,
	type RowType,
	type View,
} from "@typesql/core";
import { check, type Equal } from "./_check.js";

// #region schema
export interface DB {
	users: {
		id: Generated<"int4">; // serial / identity / DEFAULT: optional on INSERT
		email: Col<"text">; // NOT NULL
		display_name: Nullable<"text">; // NULL allowed
		mood: Enum<"mood", { hasDefault: true }>; // a CREATE TYPE … AS ENUM with a DEFAULT
		created_at: Generated<"timestamptz">;
	};
	posts: {
		id: Generated<"int8">;
		author_id: Col<"int4">;
		title: Col<"text">;
		body: Nullable<"text">;
		tags: Generated<"text[]">;
	};
	user_stats: View<{ user_id: Col<"int4">; posts: Col<"int8"> }>;
	$types: { mood: "happy" | "neutral" | "sad" };
}
// #endregion schema

// #region create
export const sql = createSql<DB>();
// #endregion create

// #region pg-catalog
const admin = createSql<DB & PgCatalog>();

const connections = admin(`
  SELECT state, count(*)::int AS total
  FROM pg_stat_activity
  WHERE datname = current_database()
  GROUP BY state`);
// { state: string | null; total: number }

const columns = admin(
	`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = $1
  ORDER BY ordinal_position`,
	"users",
);
// { column_name: string; data_type: string; is_nullable: string }
// #endregion pg-catalog
check<
	Equal<RowType<typeof connections>, { state: string | null; total: number }>
>();
check<
	Equal<
		RowType<typeof columns>,
		{ column_name: string; data_type: string; is_nullable: string }
	>
>();
