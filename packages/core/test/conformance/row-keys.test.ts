import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import postgres from "postgres";
import { createSql, type Col, type Executor, type Generated, type Nullable, type RowType } from "../../src/index.js";
import { acquireDatabase } from "./db.js";

/**
 * `rowKeys: "camelCase"` against a real Postgres through both drivers: the keys the rows come
 * back with are the keys the row type has, and JSON values keep their own keys.
 */
interface DB {
  row_keys: {
    id: Generated<"int4">;
    display_name: Nullable<"text">;
    address_line_1: Nullable<"text">;
    settings: Nullable<"jsonb">;
  };
}

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const check = <T extends true>() => {};

const db = await acquireDatabase();
const pool = db ? new Pool({ connectionString: db.url, max: 2 }) : null;
const pgjs = db ? postgres(db.url, { max: 1, onnotice: () => {} }) : null;
const executors: { name: string; executor: Executor }[] = db
  ? [
      { name: "pg", executor: async (text, values) => (await pool!.query(text, [...values])).rows },
      { name: "postgres.js", executor: async (text, values) => [...(await pgjs!.unsafe(text, [...values] as never[]))] },
    ]
  : [];

describe.skipIf(!db)("rowKeys: camelCase against Postgres", () => {
  beforeAll(async () => {
    await pool!.query("DROP TABLE IF EXISTS row_keys");
    await pool!.query("CREATE TABLE row_keys (id serial PRIMARY KEY, display_name text, address_line_1 text, settings jsonb)");
    await pool!.query(`INSERT INTO row_keys (display_name, address_line_1, settings) VALUES ('Ada', '1 Main St', '{"theme_name": "dark", "recent_items": [{"item_id": 1}]}')`);
  });
  afterAll(async () => {
    await pool?.query("DROP TABLE IF EXISTS row_keys");
    await pool?.end();
    await pgjs?.end();
    await db?.close();
  });

  describe.each(executors)("$name", ({ executor }) => {
    const sql = createSql<DB>(executor, { rowKeys: "camelCase" });

    test("row keys match the row type; JSON keys are untouched", async () => {
      const q = sql("SELECT id, display_name, address_line_1, settings, id AS row_id, count(*) OVER () AS total_count FROM row_keys");
      check<Equal<keyof RowType<typeof q>, "id" | "displayName" | "addressLine1" | "settings" | "rowId" | "totalCount">>();
      const [row] = await q.execute();
      expect(Object.keys(row!)).toEqual(["id", "displayName", "addressLine1", "settings", "rowId", "totalCount"]);
      expect(row).toMatchObject({ displayName: "Ada", addressLine1: "1 Main St", totalCount: "1" });
      expect(row!.settings).toEqual({ theme_name: "dark", recent_items: [{ item_id: 1 }] });
    });

    test("RETURNING rows are renamed too", async () => {
      const q = sql("UPDATE row_keys SET display_name = $1 RETURNING display_name, address_line_1", "Ada");
      check<Equal<RowType<typeof q>, { displayName: string | null; addressLine1: string | null }>>();
      expect(await q.execute()).toEqual([{ displayName: "Ada", addressLine1: "1 Main St" }]);
    });
  });
});
