import { describe, expect, it } from "vitest";
import { createSql, json, JsonParam, type Generated, type Json } from "../../src/index.js";
import { pendingParams } from "../../src/runtime/inline.js";

interface DB {
  docs: {
    id: Generated<"int4">;
    items: Json<{ n: number }[]>;
    meta: Json<{ tags: string[] }, { nullable: true }>;
  };
}
const sql = createSql<DB>();

describe("JsonParam", () => {
  it("serializes to the same JSON text for every driver hook", () => {
    const p = new JsonParam([{ n: 1 }, "x"]);
    // node-postgres calls toPostgres()
    expect(p.toPostgres()).toBe('[{"n":1},"x"]');
    // postgres.js's json serializer is JSON.stringify, which calls toJSON()
    expect(JSON.stringify(p)).toBe('[{"n":1},"x"]');
    // postgres.js's text serializer is '' + x
    expect(`${p}`).toBe('[{"n":1},"x"]');
    expect("" + new JsonParam("it's")).toBe('"it\'s"');
  });
});

describe("sql.json()", () => {
  it("binds a JsonParam as an inline parameter", () => {
    const items = [{ n: 1 }, { n: 2 }];
    const q = sql(`UPDATE docs SET items = ${sql.json(items)} WHERE id = ${sql.param(3)}`);
    expect(q.text).toBe("UPDATE docs SET items = $1 WHERE id = $2");
    expect(q.values[0]).toBeInstanceOf(JsonParam);
    expect((q.values[0] as JsonParam).value).toBe(items);
    expect(q.values[1]).toBe(3);
  });

  it("sends null and undefined as SQL NULL", () => {
    const q = sql(`UPDATE docs SET meta = ${sql.json(null)}`);
    expect(q.values).toEqual([null]);
    expect(sql(`UPDATE docs SET meta = ${json(undefined)}`).values).toEqual([null]);
  });

  it("works in fragments and leaves nothing pending", () => {
    const before = pendingParams();
    const set = sql.fragment(`SET meta = ${sql.json({ tags: ["a"] })}`);
    const q = sql("UPDATE docs {set} WHERE id = $1", { set }, 1);
    expect(q.text).toBe("UPDATE docs SET meta = $2 WHERE id = $1");
    expect(JSON.stringify(q.values[1])).toBe('{"tags":["a"]}');
    expect(pendingParams()).toBe(before);
  });
});
