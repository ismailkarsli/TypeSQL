import { expectTypeOf, test } from "vitest";
import postgres from "postgres";
import type { Col, Generated, Nullable, ParamsType, RowType, TsTypeOf } from "typesql";
import {
  createBigIntSql,
  createSql,
  execute,
  many,
  maybeOne,
  one,
  query,
  transaction,
  type PostgresJsBigIntTypeMap,
  type PostgresJsQueryable,
  type PostgresJsTransactable,
  type PostgresJsTypeMap,
} from "../../src/index.js";

interface DB {
  users: {
    id: Generated<"int4">;
    email: Col<"text">;
    display_name: Nullable<"text">;
    created_at: Generated<"timestamptz">;
    birthday: Nullable<"date">;
    balance: Col<"numeric">;
    avatar: Nullable<"bytea">;
    session_length: Nullable<"interval">;
    location: Nullable<"point">;
  };
  posts: {
    id: Generated<"int8">;
    author_id: Col<"int4">;
    title: Col<"text">;
    tags: Col<"text[]">;
    view_counts: Col<"int8[]">;
    meta: Nullable<"jsonb">;
  };
}

const sql = createSql<DB>();
const big = createBigIntSql<DB>();
declare const db: ReturnType<typeof postgres>;

type Row = { id: number; email: string; display_name: string | null };
const q = sql("SELECT id, email, display_name FROM users WHERE id = $1", 1);

test("PostgresJsTypeMap matches postgres.js' default parsers", () => {
  expectTypeOf<PostgresJsTypeMap["int2"]>().toEqualTypeOf<number>();
  expectTypeOf<PostgresJsTypeMap["int4"]>().toEqualTypeOf<number>();
  expectTypeOf<PostgresJsTypeMap["int8"]>().toEqualTypeOf<string>();
  expectTypeOf<PostgresJsTypeMap["oid"]>().toEqualTypeOf<number>();
  expectTypeOf<PostgresJsTypeMap["float8"]>().toEqualTypeOf<number>();
  expectTypeOf<PostgresJsTypeMap["numeric"]>().toEqualTypeOf<string>();
  expectTypeOf<PostgresJsTypeMap["bool"]>().toEqualTypeOf<boolean>();
  expectTypeOf<PostgresJsTypeMap["date"]>().toEqualTypeOf<Date>();
  expectTypeOf<PostgresJsTypeMap["timestamp"]>().toEqualTypeOf<Date>();
  expectTypeOf<PostgresJsTypeMap["timestamptz"]>().toEqualTypeOf<Date>();
  expectTypeOf<PostgresJsTypeMap["json"]>().toEqualTypeOf<unknown>();
  expectTypeOf<PostgresJsTypeMap["jsonb"]>().toEqualTypeOf<unknown>();
  expectTypeOf<PostgresJsTypeMap["bytea"]>().toEqualTypeOf<Buffer>();
  expectTypeOf<PostgresJsTypeMap["interval"]>().toEqualTypeOf<string>();
  expectTypeOf<PostgresJsTypeMap["point"]>().toEqualTypeOf<string>();
  expectTypeOf<PostgresJsTypeMap["circle"]>().toEqualTypeOf<string>();
  expectTypeOf<PostgresJsTypeMap["uuid"]>().toEqualTypeOf<string>();
  expectTypeOf<PostgresJsTypeMap["time"]>().toEqualTypeOf<string>();
  expectTypeOf<TsTypeOf<PostgresJsTypeMap, {}, "int8[]">>().toEqualTypeOf<string[]>();
  expectTypeOf<TsTypeOf<PostgresJsTypeMap, {}, "date[]">>().toEqualTypeOf<Date[]>();
});

test("PostgresJsBigIntTypeMap only changes int8", () => {
  expectTypeOf<PostgresJsBigIntTypeMap["int8"]>().toEqualTypeOf<bigint>();
  expectTypeOf<PostgresJsBigIntTypeMap["int4"]>().toEqualTypeOf<number>();
  expectTypeOf<PostgresJsBigIntTypeMap["numeric"]>().toEqualTypeOf<string>();
  expectTypeOf<PostgresJsBigIntTypeMap["date"]>().toEqualTypeOf<Date>();
  expectTypeOf<TsTypeOf<PostgresJsBigIntTypeMap, {}, "int8[]">>().toEqualTypeOf<bigint[]>();
  expectTypeOf<Omit<PostgresJsBigIntTypeMap, "int8">>().toEqualTypeOf<Omit<PostgresJsTypeMap, "int8">>();
});

test("postgres.js Sql, TransactionSql and ReservedSql satisfy the structural interfaces", () => {
  expectTypeOf<postgres.Sql>().toExtend<PostgresJsQueryable>();
  expectTypeOf<postgres.Sql>().toExtend<PostgresJsTransactable>();
  expectTypeOf<postgres.TransactionSql>().toExtend<PostgresJsQueryable>();
  expectTypeOf<postgres.ReservedSql>().toExtend<PostgresJsQueryable>();
  expectTypeOf<postgres.ReservedSql>().toExtend<PostgresJsTransactable>();
});

test("row types flow from Query through the helpers", () => {
  expectTypeOf<RowType<typeof q>>().toEqualTypeOf<Row>();
  expectTypeOf<ParamsType<typeof q>>().toEqualTypeOf<[number]>();
  expectTypeOf(query(db, q)).toEqualTypeOf<Promise<Row[]>>();
  expectTypeOf(one(db, q)).toEqualTypeOf<Promise<Row>>();
  expectTypeOf(maybeOne(db, q)).toEqualTypeOf<Promise<Row | null>>();
  expectTypeOf(many(db, q)).toEqualTypeOf<Promise<[Row, ...Row[]]>>();
  expectTypeOf(execute(db, q)).toEqualTypeOf<Promise<number>>();
});

test("driver-specific result types: default map", () => {
  expectTypeOf(query(db, sql("SELECT count(*) FROM users"))).toEqualTypeOf<Promise<{ count: string }[]>>();
  expectTypeOf(query(db, sql("SELECT id, view_counts FROM posts"))).toEqualTypeOf<Promise<{ id: string; view_counts: string[] }[]>>();
  expectTypeOf(query(db, sql("SELECT created_at, birthday, balance, avatar, session_length, location FROM users"))).toEqualTypeOf<
    Promise<{ created_at: Date; birthday: Date | null; balance: string; avatar: Buffer | null; session_length: string | null; location: string | null }[]>
  >();
});

test("driver-specific result types: bigint map", () => {
  expectTypeOf(query(db, big("SELECT count(*) FROM users"))).toEqualTypeOf<Promise<{ count: bigint }[]>>();
  expectTypeOf(query(db, big("SELECT id, view_counts FROM posts"))).toEqualTypeOf<Promise<{ id: bigint; view_counts: bigint[] }[]>>();
  expectTypeOf(query(db, big("SELECT sum(author_id) AS s, max(id) AS m FROM posts"))).toEqualTypeOf<Promise<{ s: bigint | null; m: bigint | null }[]>>();
  expectTypeOf(query(db, big("SELECT id, created_at FROM users"))).toEqualTypeOf<Promise<{ id: number; created_at: Date }[]>>();
});

test("transaction passes a queryable and returns the callback's result", () => {
  const result = transaction(db, async (tx) => {
    expectTypeOf(tx).toExtend<PostgresJsQueryable>();
    return one(tx, q);
  });
  expectTypeOf(result).toEqualTypeOf<Promise<Row>>();
});

test("invalid SQL is rejected by both pre-bound sql functions", () => {
  // @ts-expect-error unknown column
  sql("SELECT nope FROM users");
  // @ts-expect-error unknown column
  big("SELECT nope FROM users");
  // @ts-expect-error wrong param type
  sql("SELECT id FROM users WHERE id = $1", "7");
});

test("DML: execute returns the row count; RETURNING rows follow the type map", () => {
  const upd = sql("UPDATE posts SET title = $1 WHERE id = $2", "t", "1");
  expectTypeOf<RowType<typeof upd>>().toEqualTypeOf<never>();
  expectTypeOf(execute(db, upd)).toEqualTypeOf<Promise<number>>();

  const ins = big("INSERT INTO posts (author_id, title, tags, view_counts) VALUES ($1, $2, $3, $4) RETURNING id, view_counts", 1, "t", ["a"], [1n]);
  expectTypeOf(one(db, ins)).toEqualTypeOf<Promise<{ id: bigint; view_counts: bigint[] }>>();
  expectTypeOf<ParamsType<typeof ins>>().toEqualTypeOf<[number, string, string[], bigint[]]>();
});
