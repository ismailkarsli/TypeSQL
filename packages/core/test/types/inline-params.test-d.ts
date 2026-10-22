import { expectTypeOf, test } from "vitest";
import { createSql, type Col, type Enum, type Generated, type Nullable, type ParamsType, type Query, type RowType, type SqlError, type TextType } from "../../src/index.js";

interface DB {
  users: {
    id: Generated<"int4">;
    email: Col<"text">;
    display_name: Nullable<"text">;
    age: Nullable<"int4">;
    created_at: Generated<"timestamptz">;
    mood: Nullable<"mood">;
    meta: Nullable<"jsonb">;
    tags: Col<"text[]">;
  };
  $types: { mood: "happy" | "sad" };
}
const sql = createSql<DB>();

declare const userId: number;
declare const email: string;
declare const maybeName: string | null;
declare const ids: number[];
declare const when: Date;
declare const userInput: string;
declare const someText: string;

test("inline parameters become $n, typed from their context", () => {
  const q = sql(`SELECT id, email FROM users WHERE id = ${sql.param(userId)} AND email = ${sql.param(email)}`);
  expectTypeOf(q).toEqualTypeOf<Query<{ id: number; email: string }, [number | null, string | null], "SELECT id, email FROM users WHERE id = $1 AND email = $2">>();

  // after explicit $n (which stay call arguments) and after :name parameters
  const q2 = sql(`SELECT id FROM users WHERE id = $1 AND email = ${sql.param(email)}`, 5);
  expectTypeOf<TextType<typeof q2>>().toEqualTypeOf<"SELECT id FROM users WHERE id = $1 AND email = $2">();
  expectTypeOf<ParamsType<typeof q2>>().toEqualTypeOf<[number | null, string | null]>();
  const q3 = sql(`SELECT id FROM users WHERE id = :id AND email = ${sql.param(email)}`, { id: 5 });
  expectTypeOf<TextType<typeof q3>>().toEqualTypeOf<"SELECT id FROM users WHERE id = $1 AND email = $2">();

  // arrays, dates, nullable columns, enums (string accepted for the literal union), json
  sql(`SELECT id FROM users WHERE id = ANY(${sql.param(ids)}) AND created_at > ${sql.param(when)}`);
  sql(`UPDATE users SET display_name = ${sql.param(maybeName)}, mood = ${sql.param("happy")}, meta = ${sql.param({ a: 1 })} WHERE id = ${sql.param(userId)}`);
  sql(`INSERT INTO users (email, tags) VALUES (${sql.param(email)}, ${sql.param(["a", "b"])}) RETURNING id`);
  // no context: anything goes
  const q4 = sql(`SELECT ${sql.param(userInput)} AS x`);
  expectTypeOf<RowType<typeof q4>>().toEqualTypeOf<{ x: unknown }>();
});

test("inline values are checked against the parameter type", () => {
  type E<Q extends string> = Parameters<typeof sql<Q>>[0];
  // @ts-expect-error a string for an int4 column
  sql(`SELECT id FROM users WHERE id = ${sql.param("5")}`);
  // @ts-expect-error a possibly-null value for a NOT NULL column
  sql(`INSERT INTO users (email, tags) VALUES (${sql.param(maybeName)}, ${sql.param(["a"])})`);
  const nullable = `INSERT INTO users (email, tags) VALUES (${sql.param(maybeName)}, ${sql.param(["a"])})` as const;
  expectTypeOf<E<typeof nullable>>().toEqualTypeOf<typeof nullable & SqlError<"parameter $1: a string | null value cannot be used as text NOT NULL", 10>>();
  // @ts-expect-error a number[] where text[] is expected
  sql(`UPDATE users SET tags = ${sql.param(ids)}`);
  // timestamptz params take a Date or a string
  sql(`SELECT id FROM users WHERE created_at > ${sql.param("2020-01-01")} AND created_at < ${sql.param(new Date())}`);
  // @ts-expect-error a number where a timestamptz (Date | string) is expected
  sql(`SELECT id FROM users WHERE created_at > ${sql.param(1)}`);
  // the message names the parameter, the value type and the expected SQL type
  const bad = `SELECT id FROM users WHERE id = ${sql.param("5")}` as const;
  expectTypeOf<E<typeof bad>>().toEqualTypeOf<typeof bad & SqlError<"parameter $1: a string value cannot be used as int4", 7>>();
});

test("inline params inside quotes or comments are rejected", () => {
  // @ts-expect-error inside a quoted string
  sql(`SELECT id FROM users WHERE email = '${sql.param(email)}'`);
  // @ts-expect-error inside a comment
  sql(`SELECT id FROM users -- ${sql.param(email)}
       WHERE id = 1`);
});

test("SQL text that is not a literal is rejected (no string interpolation of values)", () => {
  type NotLiteral = SqlError<
    "the SQL text is not a string literal: pass values as parameters ($1, :name or ${sql.param(value)}), identifiers with sql.id(), reusable pieces as {slot} fragments, or use sql.as<Row>() for dynamic SQL",
    0
  >;
  // @ts-expect-error raw interpolation of a string value
  sql(`SELECT id FROM users WHERE email = '${userInput}'`);
  // @ts-expect-error raw interpolation of an identifier
  sql(`SELECT id FROM ${userInput}`);
  // @ts-expect-error a plain string variable
  sql(someText);
  expectTypeOf<Parameters<typeof sql<`SELECT id FROM ${string}`>>[0]>().toEqualTypeOf<`SELECT id FROM ${string}` & NotLiteral>();
  // compile-time constants are fine: TypeScript folds them into the literal
  const table = "users";
  const q = sql(`SELECT id FROM ${table} LIMIT ${10}`);
  expectTypeOf<TextType<typeof q>>().toEqualTypeOf<"SELECT id FROM users LIMIT 10">();
  // the escape hatch stays available
  sql.as<{ id: number }>(`SELECT id FROM ${userInput}`);
});

test("fragments carry their values' types; they are checked once spliced", () => {
  const byAge = sql.fragment(`AND age > ${sql.param(18)}`);
  const q = sql("SELECT id FROM users WHERE true {byAge}", { byAge });
  expectTypeOf(q).toEqualTypeOf<Query<{ id: number }, [number | null], "SELECT id FROM users WHERE true AND age > $1">>();

  const wrong = sql.fragment("AND age > $1", "eighteen");
  // @ts-expect-error a string value for an int4 parameter, carried by the fragment
  sql("SELECT id FROM users WHERE true {wrong}", { wrong });
  const wrongNamed = sql.fragment("AND email = :e", { e: 42 });
  // @ts-expect-error a number value for a text parameter
  sql("SELECT id FROM users WHERE true {wrongNamed}", { wrongNamed });
  const wrongInline = sql.fragment(`AND id = ${sql.param("x")}`);
  // @ts-expect-error
  sql("SELECT id FROM users WHERE true {wrongInline}", { wrongInline });

  // joined fragments carry all their values, in order
  const both = sql.join([sql.fragment("age > $1", 1), sql.fragment(`email = ${sql.param(email)}`)], " AND ");
  sql("SELECT id FROM users WHERE {both}", { both });
  const bothWrong = sql.join([sql.fragment("age > $1", 1), sql.fragment(`email = ${sql.param(userId)}`)], " AND ");
  // @ts-expect-error the second fragment's value is a number for a text parameter
  sql("SELECT id FROM users WHERE {bothWrong}", { bothWrong });

  // fragment arity is still enforced
  // @ts-expect-error missing value for $1
  sql.fragment("AND age > $1");
  // @ts-expect-error unknown named parameter
  sql.fragment("AND age > :min", { max: 1 });
});
