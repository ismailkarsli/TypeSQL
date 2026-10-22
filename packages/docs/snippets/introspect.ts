import { writeFile } from "node:fs/promises";
import { Client } from "pg";
import { createSql, type Col, type Generated, type RowType } from "@typesql/core";
import { generateSource, introspect, type IntrospectConfig } from "@typesql/pg/introspect";
import type { PgTypeMap } from "@typesql/pg";
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

interface HistoryItem { at: string; value: number }

// #region generated
// src/db/schema.ts, as written by `typesql introspect`
export interface DB {
  portfolio: {
    id: Generated<"uuid">;
    name: Col<"text">;
    created_at: Generated<"timestamptz">;
    history: Generated<"portfolio.history">;
  };
}

export interface ColumnTypes {
  "portfolio.history": HistoryItem[];
}
// #endregion generated

// #region use
const sql = createSql<DB, PgTypeMap & ColumnTypes>();

const recent = sql(`
  SELECT name, history, created_at::date AS day
  FROM portfolio
  WHERE created_at > now() - interval '7 days'`);
// { name: string; history: HistoryItem[]; day: Date }
// #endregion use
check<Equal<RowType<typeof recent>, { name: string; history: HistoryItem[]; day: Date }>>();

export async function regenerate(): Promise<void> {
  // #region api
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  const schema = await introspect(client, { schemas: ["public"] });
  await client.end();
  await writeFile("src/db/schema.ts", generateSource(schema, {
    // COMMENT ON COLUMN portfolio.history IS '@type HistoryItem[]'
    columnTypes: (column) => /^@type (.+)$/.exec(column.comment ?? "")?.[1],
    imports: ['import type { HistoryItem } from "../models/history.js";'],
  }));
  // #endregion api
}
