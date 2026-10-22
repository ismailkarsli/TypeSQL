import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import postgres from "postgres";
import { createSql, type Col, type Generated, type Nullable, type RowType } from "../../src/index.js";
import { acquireDatabase } from "./db.js";

/**
 * Fragment helpers whose runtime text differs from the representative text the types check
 * (`sql.list`): the SQL they generate must run on a real Postgres through both drivers.
 */
interface DB {
  helper_items: {
    id: Generated<"int4">;
    name: Col<"text">;
    price: Col<"int4">;
    note: Nullable<"text">;
  };
}
const sql = createSql<DB>();

const db = await acquireDatabase();
type Run = (q: { text: string; values: readonly unknown[] }) => Promise<Record<string, unknown>[]>;
const pool = db ? new Pool({ connectionString: db.url }) : null;
const pgjs = db ? postgres(db.url, { onnotice: () => {} }) : null;
const drivers: { name: string; run: Run }[] = db
  ? [
      { name: "pg", run: async (q) => (await pool!.query(q.text, [...q.values])).rows },
      { name: "postgres.js", run: async (q) => [...(await pgjs!.unsafe(q.text, [...q.values] as never[]))] as Record<string, unknown>[] },
    ]
  : [];

describe.skipIf(!db)("fragment helpers against Postgres", () => {
  beforeAll(async () => {
    await pool!.query("DROP TABLE IF EXISTS helper_items");
    await pool!.query("CREATE TABLE helper_items (id serial PRIMARY KEY, name text NOT NULL, price int NOT NULL, note text)");
    await pool!.query("INSERT INTO helper_items (name, price, note) VALUES ('b', 20, NULL), ('a', 20, 'x'), ('c', 10, 'y')");
  });
  afterAll(async () => {
    await pool?.query("DROP TABLE IF EXISTS helper_items");
    await pool?.end();
    await pgjs?.end();
    await db?.close();
  });

  describe.each(drivers)("$name", ({ run }) => {
    test("sql.list: ORDER BY and WHERE from runtime arrays", async () => {
      const SORT = {
        name: { asc: sql.fragment("i.name"), desc: sql.fragment("i.name DESC") },
        price: { asc: sql.fragment("i.price"), desc: sql.fragment("i.price DESC") },
        near: { asc: sql.fragment(`abs(i.price - ${sql.param(12)})`), desc: sql.fragment(`abs(i.price - ${sql.param(12)}) DESC`) },
      } as const;
      const sort: { field: keyof typeof SORT; dir: "asc" | "desc" }[] = [{ field: "price", dir: "desc" }, { field: "name", dir: "asc" }];
      const order = sql.list([...sort.map(({ field, dir }) => SORT[field][dir]), sql.fragment("i.id")]);
      const q = sql("SELECT i.name FROM helper_items i ORDER BY {order}", { order });
      expect((await run(q)) as RowType<typeof q>[]).toEqual([{ name: "a" }, { name: "b" }, { name: "c" }]);

      const near = sql.list([SORT.near.asc, SORT.name.asc]);
      const q2 = sql("SELECT i.name FROM helper_items i WHERE i.price > $1 ORDER BY {near}", { near }, 0);
      expect(q2.values).toEqual([0, 12]);
      expect(await run(q2)).toEqual([{ name: "c" }, { name: "a" }, { name: "b" }]);

      const filters = [sql.fragment("i.price >= $1", 15), sql.fragment(`i.note IS NOT NULL`), sql.fragment("i.name <> $1", "zzz")];
      const where = sql.list(filters, " AND ");
      const q3 = sql("SELECT i.name FROM helper_items i WHERE {where}", { where });
      expect(await run(q3)).toEqual([{ name: "a" }]);
    });
  });
});
