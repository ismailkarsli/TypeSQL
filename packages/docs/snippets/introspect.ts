import { writeFile } from "node:fs/promises";
import {
	type Col,
	createSql,
	type Generated,
	type Json,
	type RowType,
} from "@typesql/core";
import type { PgTypeMap } from "@typesql/pg";
import {
	generateSource,
	type IntrospectConfig,
	introspect,
} from "@typesql/pg/introspect";
import { Client } from "pg";
import { check, type Equal } from "./_check.js";

// #region config
// typesql.config.ts, used with `typesql introspect --config typesql.config.ts`
export default {
	out: "src/db/schema.ts",
	schemas: ["public", "auth"],
	imports: ['import type { HistoryItem } from "../models/history.js";'],
	columnTypes: {
		"portfolio.history": "HistoryItem[]", // public.portfolio.history
		"auth.users.settings": "{ theme: string }", // a table outside public: schema.table.column
	},
} satisfies IntrospectConfig;
// #endregion config

interface HistoryItem {
	at: string;
	value: number;
}

// #region generated
// src/db/schema.ts, as written by `typesql introspect`
export interface DB {
	portfolio: {
		id: Generated<"uuid">;
		name: Col<"text">;
		created_at: Generated<"timestamptz">;
		history: Json<HistoryItem[], { hasDefault: true }>;
	};
}
// #endregion generated

// #region use
const sql = createSql<DB, PgTypeMap>();

const recent = sql(`
  SELECT name, history, history -> -1 -> 'value' AS last, created_at::date AS day
  FROM portfolio
  WHERE created_at > now() - interval '7 days'`);
// { name: string; history: HistoryItem[]; last: number | null; day: Date }

declare const history: HistoryItem[];
const save = sql(
	`UPDATE portfolio SET history = ${sql.json(history)} WHERE name = $1`,
	"a",
);
// #endregion use
check<
	Equal<
		RowType<typeof recent>,
		{ name: string; history: HistoryItem[]; last: number | null; day: Date }
	>
>();
check<Equal<RowType<typeof save>, never>>();

export async function regenerate(): Promise<void> {
	// #region api
	const client = new Client({ connectionString: process.env["DATABASE_URL"] });
	await client.connect();
	const schema = await introspect(client, { schemas: ["public"] });
	await client.end();
	await writeFile(
		"src/db/schema.ts",
		generateSource(schema, {
			// COMMENT ON COLUMN portfolio.history IS '@type HistoryItem[]'
			columnTypes: (column) => /^@type (.+)$/.exec(column.comment ?? "")?.[1],
			imports: ['import type { HistoryItem } from "../models/history.js";'],
		}),
	);
	// #endregion api
}
