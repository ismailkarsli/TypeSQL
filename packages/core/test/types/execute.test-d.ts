import { expectTypeOf, test } from "vitest";
import { createSql, type Col, type Executor, type Generated, type Nullable } from "../../src/index.js";

interface DB {
  users: { id: Generated<"int4">; email: Col<"text">; display_name: Nullable<"text"> };
}

declare const executor: Executor;
const sql = createSql<DB>(executor);
type Row = { id: number; display_name: string | null };

test("execute methods are typed from the row", () => {
  const q = sql("SELECT id, display_name FROM users WHERE id = $1", 1);
  expectTypeOf(q.execute()).toEqualTypeOf<Promise<Row[]>>();
  expectTypeOf(q.executeTakeFirst()).toEqualTypeOf<Promise<Row | undefined>>();
  expectTypeOf(q.executeTakeFirstOrThrow(executor)).toEqualTypeOf<Promise<Row>>();
});

test("sql.as and DML without RETURNING", () => {
  expectTypeOf(sql.as<{ n: number }>("SELECT 1 AS n").execute()).toEqualTypeOf<Promise<{ n: number }[]>>();
  expectTypeOf(sql("DELETE FROM users WHERE id = $1", 1).execute()).toEqualTypeOf<Promise<never[]>>();
});
