import { expectTypeOf, test } from "vitest";
import { createSql, type Col, type Generated, type Nullable, type Query, type Fragment, type SqlError, type Splice, type SlotNames, type QuotedIdent, type JoinedText } from "../../src/index.js";

interface DB {
  users: { id: Generated<"int4">; email: Col<"text">; display_name: Nullable<"text">; age: Nullable<"int4"> };
  posts: { id: Generated<"int8">; author_id: Col<"int4">; title: Col<"text"> };
}
const sql = createSql<DB>();

test("type-level splice", () => {
  expectTypeOf<Splice<"SELECT 1 {a} x {b}", { a: { text: "AAA" }; b: { text: "BBB" } }>>().toEqualTypeOf<"SELECT 1 AAA x BBB">();
  expectTypeOf<Splice<"SELECT $1 {a}", { a: { text: "WHERE x = $1 AND y = $2" } }>>().toEqualTypeOf<"SELECT $1 WHERE x = $2 AND y = $3">();
  expectTypeOf<Splice<"SELECT '{1,2}'::int[] {a}", { a: { text: "AS arr" } }>>().toEqualTypeOf<"SELECT '{1,2}'::int[] AS arr">();
  expectTypeOf<Splice<"SELECT 1 {zzz}", { a: { text: "x" } }>>().toEqualTypeOf<SqlError<"unknown fragment slot {zzz}", null>>();
  expectTypeOf<Splice<"SELECT 1 {a}", { a: { text: string } }>>().toEqualTypeOf<string>();
  expectTypeOf<SlotNames<"SELECT {a}, {b_c} FROM t WHERE x = '{1}'">>().toEqualTypeOf<"a" | "b_c">();
  expectTypeOf<QuotedIdent<["a"]>>().toEqualTypeOf<'"a"'>();
  expectTypeOf<QuotedIdent<["s", 'we"ird']>>().toEqualTypeOf<'"s"."we""ird"'>();
  expectTypeOf<JoinedText<[{ text: "a = $1" }, { text: "b = $1" }], " AND ">>().toEqualTypeOf<"a = $1 AND b = $2">();
});

test("fragments are spliced before inference", () => {
  const where = sql.fragment("WHERE u.id = $1", 7);
  expectTypeOf(where).toEqualTypeOf<Fragment<"WHERE u.id = $1", [unknown], ["n"]>>();
  const q = sql("SELECT u.id, u.email FROM users u {where}", { where });
  expectTypeOf(q).toEqualTypeOf<Query<{ id: number; email: string }, [number | null], "SELECT u.id, u.email FROM users u WHERE u.id = $1">>();

  // outer params come first; fragment params are renumbered and travel with the fragment
  const q2 = sql("SELECT u.id FROM users u WHERE u.email = $1 {more}", { more: sql.fragment("AND u.age > $1", 18) }, "a@b.c");
  expectTypeOf(q2).toEqualTypeOf<Query<{ id: number }, [string | null, number | null], "SELECT u.id FROM users u WHERE u.email = $1 AND u.age > $2">>();

  // a whole query can be spliced as a subquery
  const sub = sql("SELECT author_id FROM posts WHERE title = $1", "x");
  const q3 = sql("SELECT u.id FROM users u WHERE u.id IN ({sub})", { sub });
  expectTypeOf(q3).toEqualTypeOf<Query<{ id: number }, [string | null], "SELECT u.id FROM users u WHERE u.id IN (SELECT author_id FROM posts WHERE title = $1)">>();

  // identifiers and joins
  const col = sql.id("display_name");
  const q4 = sql("SELECT {col} FROM users", { col });
  expectTypeOf(q4).toEqualTypeOf<Query<{ display_name: string | null }, [], 'SELECT "display_name" FROM users'>>();
  const conds = sql.join([sql.fragment("age > $1", 1), sql.fragment("email = $1", "e")], " AND ");
  const q5 = sql("SELECT id FROM users WHERE {conds}", { conds });
  expectTypeOf(q5).toEqualTypeOf<Query<{ id: number }, [number | null, string | null], "SELECT id FROM users WHERE age > $1 AND email = $2">>();

  // errors inside spliced text are reported
  // @ts-expect-error unknown column inside the fragment
  sql("SELECT u.id FROM users u {where}", { where: sql.fragment("WHERE u.nope = 1") });
  // @ts-expect-error missing slot
  sql("SELECT u.id FROM users u {where}", {});
  // @ts-expect-error wrong outer param type
  sql("SELECT u.id FROM users u WHERE u.id = $1 {w}", { w: sql.fragment("AND true") }, "x");
});

test("dynamic fragments fall back to sql.as", () => {
  const raw = sql.raw("WHERE 1 = 1");
  expectTypeOf(raw).toEqualTypeOf<Fragment<string, [], []>>();
  // @ts-expect-error dynamic fragment cannot be inferred
  sql("SELECT id FROM users {raw}", { raw });
  const ok = sql.as<{ id: number }>("SELECT id FROM users {raw}", { raw });
  expectTypeOf(ok).toEqualTypeOf<Query<{ id: number }, readonly unknown[]>>();
  const arr: Fragment<"x = 1", []>[] = [];
  const joined = sql.join(arr);
  expectTypeOf(joined).toEqualTypeOf<Fragment<string, readonly unknown[], []>>();
});

test("plain calls still work with object params", () => {
  const q = sql("SELECT id FROM users WHERE id = $1", 1);
  expectTypeOf(q).toEqualTypeOf<Query<{ id: number }, [number | null], "SELECT id FROM users WHERE id = $1">>();
});
