import { describe, expect, it } from "vitest";
import { createSql, joinFragments, maxParam, quoteIdent, renumberParams, splice } from "../../src/index.js";

describe("renumberParams", () => {
  it("offsets placeholders outside literals and comments", () => {
    expect(renumberParams("a = $1 AND b = $2", 2)).toBe("a = $3 AND b = $4");
    expect(renumberParams("a = '$1' AND b = $1 -- $9\n AND c = $2 /* $8 */ AND d = $$ $7 $$", 10)).toBe("a = '$1' AND b = $11 -- $9\n AND c = $12 /* $8 */ AND d = $$ $7 $$");
    expect(renumberParams('x = "we""ird$1" AND y = $1', 1)).toBe('x = "we""ird$1" AND y = $2');
    expect(renumberParams("$10 $1", 1)).toBe("$11 $2");
  });
  it("maxParam ignores literals", () => {
    expect(maxParam("SELECT $2, '$9', $1")).toBe(2);
    expect(maxParam("SELECT 1")).toBe(0);
  });
});

describe("splice", () => {
  it("replaces slots, renumbers and appends values", () => {
    const r = splice("SELECT * FROM t WHERE a = $1 {w} {o}", { w: { text: "AND b = $1 AND c = $2", values: ["b", "c"] }, o: { text: "ORDER BY $1", values: [3] } }, ["a"]);
    expect(r.text).toBe("SELECT * FROM t WHERE a = $1 AND b = $2 AND c = $3 ORDER BY $4");
    expect(r.values).toEqual(["a", "b", "c", 3]);
  });
  it("leaves non-identifier braces alone and throws on unknown slots", () => {
    expect(splice("SELECT '{1,2}'::int[] {a}", { a: { text: "AS x", values: [] } }, []).text).toBe("SELECT '{1,2}'::int[] AS x");
    expect(() => splice("SELECT {nope}", {}, [])).toThrow(/unknown fragment slot/);
  });
});

describe("helpers", () => {
  it("quoteIdent", () => {
    expect(quoteIdent("a")).toBe('"a"');
    expect(quoteIdent("s", 'we"ird')).toBe('"s"."we""ird"');
  });
  it("joinFragments renumbers left to right", () => {
    const r = joinFragments([{ text: "a = $1", values: [1] }, { text: "b = $1 AND c = $2", values: [2, 3] }], " AND ");
    expect(r).toEqual({ text: "a = $1 AND b = $2 AND c = $3", values: [1, 2, 3] });
  });
});

describe("createSql runtime", () => {
  interface DB { users: { id: { type: "int4"; nullable: false; hasDefault: true }; email: { type: "text"; nullable: false; hasDefault: false } } }
  const sql = createSql<DB>();
  it("builds plain queries", () => {
    expect(sql("SELECT id FROM users WHERE id = $1", 7)).toEqual({ text: "SELECT id FROM users WHERE id = $1", values: [7] });
  });
  it("splices fragments", () => {
    const where = sql.fragment("WHERE id = $1", 7);
    const q = sql("SELECT id FROM users {where}", { where });
    expect(q).toEqual({ text: "SELECT id FROM users WHERE id = $1", values: [7] });
    const q2 = sql("SELECT id FROM users WHERE email = $1 {more}", { more: sql.fragment("AND id > $1", 3) }, "e");
    expect(q2).toEqual({ text: "SELECT id FROM users WHERE email = $1 AND id > $2", values: ["e", 3] });
  });
  it("id, join, raw, as", () => {
    expect(sql.id("a", "b")).toEqual({ text: '"a"."b"', values: [] });
    expect(sql.join([sql.fragment("x = $1", 1), sql.fragment("y = $1", 2)], " OR ")).toEqual({ text: "x = $1 OR y = $2", values: [1, 2] });
    expect(sql.raw("WHERE 1=1")).toEqual({ text: "WHERE 1=1", values: [] });
    expect(sql.as<{ id: number }>("SELECT id FROM users {r}", { r: sql.raw("WHERE 1=1") })).toEqual({ text: "SELECT id FROM users WHERE 1=1", values: [] });
    // an object param without slots in the text is a value, not a slot map
    expect(sql.as<{ id: number }>("SELECT $1::jsonb", { a: 1 })).toEqual({ text: "SELECT $1::jsonb", values: [{ a: 1 }] });
  });
});

describe("sql.list", () => {
  interface DB { users: { id: { type: "int4"; nullable: false; hasDefault: true }; email: { type: "text"; nullable: false; hasDefault: false } } }
  const sql = createSql<DB>();
  const SORT = { id: sql.fragment("id DESC"), email: sql.fragment("email"), near: sql.fragment("abs(id - $1)", 5) } as const;
  it("joins a runtime array, repeating and renumbering elements", () => {
    const keys: (keyof typeof SORT)[] = ["near", "email", "near"];
    const order = sql.list(keys.map((k) => SORT[k]));
    expect(order).toEqual({ text: "abs(id - $1), email, abs(id - $2)", values: [5, 5] });
    const q = sql("SELECT id FROM users WHERE id > $1 ORDER BY {order}", { order }, 0);
    expect(q).toEqual({ text: "SELECT id FROM users WHERE id > $1 ORDER BY abs(id - $2), email, abs(id - $3)", values: [0, 5, 5] });
    expect(sql.list([SORT.id, SORT.email], " AND ").text).toBe("id DESC AND email");
  });
  it("throws on an empty array", () => {
    expect(() => sql.list([])).toThrow(/sql.list\(\) needs at least one item/);
  });
});

describe("named parameters", () => {
  interface DB { users: { id: { type: "int4"; nullable: false; hasDefault: true }; email: { type: "text"; nullable: false; hasDefault: false } } }
  const sql = createSql<DB>();
  it("rewrites :name to $n in first-appearance order and builds values from the object", () => {
    const q = sql("SELECT id FROM users WHERE id = :id AND email = :email OR id = :id", { id: 1, email: "x" });
    expect(q).toEqual({ text: "SELECT id FROM users WHERE id = $1 AND email = $2 OR id = $1", values: [1, "x"] });
  });
  it("ignores casts, := and literals", () => {
    const q = sql("SELECT id::text AS t, 'a:b' AS s FROM users WHERE id = :id", { id: 3 });
    expect(q).toEqual({ text: "SELECT id::text AS t, 'a:b' AS s FROM users WHERE id = $1", values: [3] });
  });
  it("throws on missing names", () => {
    expect(() => sql.as("SELECT :a, :b", { a: 1 })).toThrow(/missing named parameter :b/);
  });
  it("combines with fragments", () => {
    const where = sql.fragment("WHERE id > :min", { min: 18 });
    expect(where).toEqual({ text: "WHERE id > $1", values: [18] });
    const q = sql("SELECT id FROM users u {where}", { where });
    expect(q).toEqual({ text: "SELECT id FROM users u WHERE id > $1", values: [18] });
    const more = sql.fragment("AND id > :min", { min: 18 });
    const q2 = sql("SELECT id FROM users u WHERE email = :email {more}", { more }, { email: "e" });
    expect(q2).toEqual({ text: "SELECT id FROM users u WHERE email = $1 AND id > $2", values: ["e", 18] });
  });
});
