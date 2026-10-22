import { createSql, type Col, type Generated, type Json, type ParamsType, type RowType } from "@typesql/core";
import { check, type Equal } from "./_check.js";

// #region schema
type HistoryItem = { at: string; state: { value: number; note?: string } };

interface DB {
  portfolio: {
    id: Generated<"int4">;
    name: Col<"text">;
    history: Json<HistoryItem[], { hasDefault: true }>; // jsonb NOT NULL DEFAULT '[]'
    settings: Json<{ theme: "dark" | "light" }, { nullable: true }>; // jsonb, NULL allowed
  };
}
const sql = createSql<DB>();
// #endregion schema

declare const history: HistoryItem[];

// #region read
const latest = sql(`SELECT id, history -> -1 -> 'state' AS state, settings ->> 'theme' AS theme FROM portfolio`);
// { id: number; state: { value: number; note?: string } | null; theme: string | null }
// #endregion read
check<Equal<RowType<typeof latest>, { id: number; state: { value: number; note?: string } | null; theme: string | null }>>();

// #region write
const save = sql(`UPDATE portfolio SET history = ${sql.json(history)} WHERE id = ${sql.param(1)}`);
// ParamsType: [HistoryItem[], number]; the history is sent as JSON text by pg and postgres.js
// #endregion write
check<Equal<ParamsType<typeof save>, [HistoryItem[], number]>>();
