import { expectTypeOf, test } from "vitest";
import type { Client, Pool, PoolClient } from "pg";
import type { Col, Generated, Nullable, ParamsType, RowType, TsTypeOf } from "typesql";
import {
  createSql,
  execute,
  many,
  maybeOne,
  one,
  query,
  transaction,
  type PgInterval,
  type PgPoolLike,
  type PgQueryable,
  type PgTransactionClient,
  type PgTypeMap,
} from "../../src/index.js";

interface DB {
  users: {
    id: Generated<"int4">;
    email: Col<"text">;
    display_name: Nullable<"text">;
    created_at: Generated<"timestamptz">;
    balance: Col<"numeric">;
    avatar: Nullable<"bytea">;
    session_length: Nullable<"interval">;
  };
  posts: {
    id: Generated<"int8">;
    author_id: Col<"int4">;
    title: Col<"text">;
    tags: Col<"text[]">;
    meta: Nullable<"jsonb">;
  };
}

const sql = createSql<DB>();
declare const pool: Pool;

type Row = { id: number; email: string; display_name: string | null };
const q = sql("SELECT id, email, display_name FROM users WHERE id = $1", 1);

test("PgTypeMap matches pg's default parsers", () => {
  expectTypeOf<PgTypeMap["int2"]>().toEqualTypeOf<number>();
  expectTypeOf<PgTypeMap["int4"]>().toEqualTypeOf<number>();
  expectTypeOf<PgTypeMap["int8"]>().toEqualTypeOf<string>();
  expectTypeOf<PgTypeMap["oid"]>().toEqualTypeOf<number>();
  expectTypeOf<PgTypeMap["float4"]>().toEqualTypeOf<number>();
  expectTypeOf<PgTypeMap["float8"]>().toEqualTypeOf<number>();
  expectTypeOf<PgTypeMap["numeric"]>().toEqualTypeOf<string>();
  expectTypeOf<PgTypeMap["bool"]>().toEqualTypeOf<boolean>();
  expectTypeOf<PgTypeMap["date"]>().toEqualTypeOf<Date>();
  expectTypeOf<PgTypeMap["timestamp"]>().toEqualTypeOf<Date>();
  expectTypeOf<PgTypeMap["timestamptz"]>().toEqualTypeOf<Date>();
  expectTypeOf<PgTypeMap["json"]>().toEqualTypeOf<unknown>();
  expectTypeOf<PgTypeMap["jsonb"]>().toEqualTypeOf<unknown>();
  expectTypeOf<PgTypeMap["bytea"]>().toEqualTypeOf<Buffer>();
  expectTypeOf<PgTypeMap["interval"]>().toEqualTypeOf<PgInterval>();
  expectTypeOf<PgTypeMap["uuid"]>().toEqualTypeOf<string>();
  expectTypeOf<PgTypeMap["text"]>().toEqualTypeOf<string>();
  expectTypeOf<PgTypeMap["time"]>().toEqualTypeOf<string>();
  expectTypeOf<PgTypeMap["money"]>().toEqualTypeOf<string>();
  expectTypeOf<PgTypeMap["point"]>().toEqualTypeOf<{ x: number; y: number }>();
  expectTypeOf<PgTypeMap["circle"]>().toEqualTypeOf<{ x: number; y: number; radius: number }>();
  expectTypeOf<PgTypeMap["record"]>().toEqualTypeOf<string>();
  expectTypeOf<TsTypeOf<PgTypeMap, {}, "int8[]">>().toEqualTypeOf<string[]>();
  expectTypeOf<TsTypeOf<PgTypeMap, {}, "timestamptz[]">>().toEqualTypeOf<Date[]>();
});

test("pg's Pool, Client and PoolClient satisfy the structural interfaces", () => {
  expectTypeOf<Pool>().toExtend<PgQueryable>();
  expectTypeOf<Client>().toExtend<PgQueryable>();
  expectTypeOf<PoolClient>().toExtend<PgQueryable>();
  expectTypeOf<PoolClient>().toExtend<PgTransactionClient>();
  expectTypeOf<Pool>().toExtend<PgPoolLike>();
});

test("row types flow from Query through the helpers", () => {
  expectTypeOf<RowType<typeof q>>().toEqualTypeOf<Row>();
  expectTypeOf<ParamsType<typeof q>>().toEqualTypeOf<[number]>();
  expectTypeOf(query(pool, q)).toEqualTypeOf<Promise<Row[]>>();
  expectTypeOf(one(pool, q)).toEqualTypeOf<Promise<Row>>();
  expectTypeOf(maybeOne(pool, q)).toEqualTypeOf<Promise<Row | null>>();
  expectTypeOf(many(pool, q)).toEqualTypeOf<Promise<[Row, ...Row[]]>>();
  expectTypeOf(execute(pool, q)).toEqualTypeOf<Promise<number>>();
});

test("pg-specific result types", () => {
  expectTypeOf(query(pool, sql("SELECT count(*) FROM users"))).toEqualTypeOf<Promise<{ count: string }[]>>();
  expectTypeOf(query(pool, sql("SELECT count(*) AS n, max(created_at) AS latest FROM users"))).toEqualTypeOf<
    Promise<{ n: string; latest: Date | null }[]>
  >();
  expectTypeOf(query(pool, sql("SELECT id, balance, avatar, session_length FROM users"))).toEqualTypeOf<
    Promise<{ id: number; balance: string; avatar: Buffer | null; session_length: PgInterval | null }[]>
  >();
  expectTypeOf(query(pool, sql("SELECT p.id, p.tags, p.meta, u.created_at FROM posts p JOIN users u ON u.id = p.author_id"))).toEqualTypeOf<
    Promise<{ id: string; tags: string[]; meta: unknown; created_at: Date }[]>
  >();
  expectTypeOf(query(pool, sql("SELECT u.email, p.title FROM users u LEFT JOIN posts p ON p.author_id = u.id"))).toEqualTypeOf<
    Promise<{ email: string; title: string | null }[]>
  >();
});

test("transaction passes a queryable client and returns the callback's result", () => {
  const result = transaction(pool, async (client) => {
    expectTypeOf(client).toExtend<PgQueryable>();
    expectTypeOf(client).toExtend<PgTransactionClient>();
    return one(client, q);
  });
  expectTypeOf(result).toEqualTypeOf<Promise<Row>>();
});

test("invalid SQL is rejected by the pre-bound sql", () => {
  // @ts-expect-error unknown column
  sql("SELECT nope FROM users");
  // @ts-expect-error wrong param type
  sql("SELECT id FROM users WHERE id = $1", "7");
  // @ts-expect-error missing param
  sql("SELECT id FROM users WHERE id = $1");
});

test("DML: execute returns the row count; RETURNING rows flow through query/one", () => {
  const upd = sql("UPDATE posts SET title = $1 WHERE id = $2", "t", "1");
  expectTypeOf<RowType<typeof upd>>().toEqualTypeOf<never>();
  expectTypeOf<ParamsType<typeof upd>>().toEqualTypeOf<[string, string]>();
  expectTypeOf(execute(pool, upd)).toEqualTypeOf<Promise<number>>();

  const ins = sql("INSERT INTO users (email, balance) VALUES ($1, $2) RETURNING id, created_at", "a@b.c", "0");
  expectTypeOf(one(pool, ins)).toEqualTypeOf<Promise<{ id: number; created_at: Date }>>();

  const del = sql("DELETE FROM posts WHERE author_id = $1 RETURNING id, tags", 1);
  expectTypeOf(query(pool, del)).toEqualTypeOf<Promise<{ id: string; tags: string[] }[]>>();

  // @ts-expect-error email is NOT NULL without a default
  sql("INSERT INTO users (display_name) VALUES ($1)", "x");
});
