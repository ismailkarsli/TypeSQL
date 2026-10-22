import { expectTypeOf, test } from "vitest";
import { createSql, type Col, type Executor, type ExecutorResult, type Generated, type Nullable } from "../../src/index.js";

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

test("executeCount resolves to a number", () => {
  expectTypeOf(sql("DELETE FROM users WHERE id = $1", 1).executeCount()).toEqualTypeOf<Promise<number>>();
  expectTypeOf(sql("SELECT id FROM users").executeCount(executor)).toEqualTypeOf<Promise<number>>();
});

test("an Executor resolves to rows or to { rows, rowCount }", () => {
  const rowsOnly: Executor = async () => [{ id: 1 }];
  const withCount: Executor = async () => ({ rows: [{ id: 1 }], rowCount: 1 });
  const noCount: Executor = async () => ({ rows: [], rowCount: null });
  const thenable: Executor = () => ({ then: (resolve) => resolve!([]) }) as PromiseLike<readonly unknown[]>;
  void [rowsOnly, withCount, noCount, thenable];
  // @ts-expect-error rowCount is a number or null
  const badCount: Executor = async () => ({ rows: [], rowCount: "1" });
  // @ts-expect-error rows are required
  const noRows: Executor = async () => ({ rowCount: 1 });
  void [badCount, noRows];
  expectTypeOf<ExecutorResult>().toEqualTypeOf<{ readonly rows: readonly unknown[]; readonly rowCount: number | null }>();
});
