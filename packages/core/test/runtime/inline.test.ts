import { afterEach, describe, expect, it, vi } from "vitest";
import { createSql } from "../../src/index.js";
import { param, pendingParams, takeValue } from "../../src/runtime/inline.js";

interface DB {
	users: {
		id: { type: "int4"; nullable: false; hasDefault: true };
		email: { type: "text"; nullable: false; hasDefault: false };
		age: { type: "int4"; nullable: true; hasDefault: false };
	};
}
const sql = createSql<DB>();

describe("inline parameters", () => {
	it("become $n in order of appearance, values in the same order", () => {
		const q = sql(
			`SELECT id FROM users WHERE id = ${sql.param(7)} AND email = ${sql.param("a@b.c")}`,
		);
		expect(q).toEqual({
			text: "SELECT id FROM users WHERE id = $1 AND email = $2",
			values: [7, "a@b.c"],
		});
	});

	it("are numbered after positional and named parameters", () => {
		expect(
			sql(
				`SELECT id FROM users WHERE id = $1 AND email = ${sql.param("e")}`,
				5,
			),
		).toEqual({
			text: "SELECT id FROM users WHERE id = $1 AND email = $2",
			values: [5, "e"],
		});
		expect(
			sql(`SELECT id FROM users WHERE id = :id AND email = ${sql.param("e")}`, {
				id: 5,
			}),
		).toEqual({
			text: "SELECT id FROM users WHERE id = $1 AND email = $2",
			values: [5, "e"],
		});
	});

	it("are numbered after every positional value, and after every $n of the text", () => {
		// sql.as is not checked: the text may not use every value, or use more than it has
		expect(sql.as(`SELECT $1, ${param("x")}`, 1, 2)).toEqual({
			text: "SELECT $1, $3",
			values: [1, 2, "x"],
		});
		expect(sql.as(`SELECT $2, ${param("x")}`, 1)).toEqual({
			text: "SELECT $2, $3",
			values: [1, "x"],
		});
	});

	it("never put the value into the SQL text", () => {
		const evil = "x'; DROP TABLE users; --";
		const q = sql(`SELECT id FROM users WHERE email = ${sql.param(evil)}`);
		expect(q.text).toBe("SELECT id FROM users WHERE email = $1");
		expect(q.values).toEqual([evil]);
	});

	it("keep objects, arrays, dates and null as values", () => {
		const d = new Date(0);
		const q = sql.as<{ id: number }>(
			`SELECT id FROM users WHERE created_at > ${param(d)} AND id = ANY(${param([1, 2])}) AND meta = ${param({ a: 1 })} AND age IS NOT DISTINCT FROM ${param(null)}`,
		);
		expect(q.values).toEqual([d, [1, 2], { a: 1 }, null]);
		expect(q.values[0]).toBe(d);
	});

	it("work in fragments, which resolve them at creation and can be reused", () => {
		const byAge = sql.fragment(`AND age > ${sql.param(18)}`);
		expect(byAge).toEqual({ text: "AND age > $1", values: [18] });
		const q1 = sql(
			`SELECT id FROM users WHERE email = ${sql.param("a")} {byAge}`,
			{ byAge },
		);
		expect(q1).toEqual({
			text: "SELECT id FROM users WHERE email = $1 AND age > $2",
			values: ["a", 18],
		});
		const q2 = sql("SELECT id FROM users WHERE true {byAge}", { byAge });
		expect(q2).toEqual({
			text: "SELECT id FROM users WHERE true AND age > $1",
			values: [18],
		});
	});

	it("are rejected inside quoted strings and comments", () => {
		expect(() => sql.as(`SELECT '${param(1)}'`)).toThrow(
			/inside a quoted string/,
		);
		expect(() => sql.as(`SELECT 1 -- ${param(1)}\n`)).toThrow(
			/inside a comment/,
		);
		expect(() => sql.as(`SELECT "${param(1)}"`)).toThrow(
			/inside a quoted identifier/,
		);
		const inside = [
			[`SELECT 'it''s ${param(1)}'`, "a quoted string"],
			[`SELECT '${param(1)}`, "a quoted string"],
			[`SELECT "a""${param(1)}"`, "a quoted identifier"],
			[`SELECT "${param(1)}`, "a quoted identifier"],
			[`SELECT 1 /* ${param(1)} */`, "a comment"],
			[`SELECT 1 /* ${param(1)}`, "a comment"],
			[`SELECT 1 -- ${param(1)}`, "a comment"],
		] as const;
		for (const [text, where] of inside)
			expect(() => sql.as(text)).toThrow(
				`typesql: sql.param() cannot be used inside ${where}; remove the surrounding quotes or comment`,
			);
	});

	it("are read after quoted strings, quoted identifiers and comments", () => {
		const before = pendingParams();
		expect(
			sql.as(
				`SELECT 'a', '', "b", 1 -- c\n, ${param(1)} /* d */ + ${param(2)}, '-- /*'`,
			),
		).toEqual({
			text: "SELECT 'a', '', \"b\", 1 -- c\n, $1 /* d */ + $2, '-- /*'",
			values: [1, 2],
		});
		// in a dollar-quoted string too, as the types read it
		expect(sql.as(`SELECT $$ ${param(3)} $$`)).toEqual({
			text: "SELECT $$ $1 $$",
			values: [3],
		});
		expect(pendingParams()).toBe(before);
	});

	it("are single-use: a token cannot be replayed in another statement", () => {
		const token = param(1);
		sql.as(`SELECT ${token}`);
		expect(() => sql.as(`SELECT ${token}`)).toThrow(/already used/);
	});

	it("a token repeated within one statement binds the value at each occurrence", () => {
		const token = param(3);
		expect(sql.as(`SELECT ${token}, ${token}`)).toEqual({
			text: "SELECT $1, $2",
			values: [3, 3],
		});
	});

	it("cannot be forged: a NUL in the text that is not a token is an error", () => {
		expect(() => sql.as("SELECT '\u0000typesql0000\u0000'")).toThrow();
		expect(() => sql.as("SELECT \u0000typesqldeadbeefdeadbeef0\u0000")).toThrow(
			/NUL character/,
		);
	});

	it("only a string that is exactly a token is taken as a value", () => {
		const before = pendingParams();
		const token = param(4);
		expect(takeValue([token])).toEqual([token]);
		expect(takeValue(` ${token}`)).toBe(` ${token}`);
		expect(takeValue(token)).toBe(4);
		expect(() => takeValue(token)).toThrow(/already used/);
		expect(takeValue(5)).toBe(5);
		expect(pendingParams()).toBe(before);
	});

	it("leaves tokens with trailing text or a final newline as ordinary strings", () => {
		const before = pendingParams();
		const token: string = param(4);
		expect(takeValue(`${token}tail`)).toBe(`${token}tail`);
		for (const ending of ["\n", "\r", "\r\n", "\u2028", "\u2029"]) {
			expect(takeValue(`${token}${ending}`)).toBe(`${token}${ending}`);
		}
		expect(pendingParams()).toBe(before + 1);
		expect(takeValue(token)).toBe(4);
		expect(pendingParams()).toBe(before);
	});

	it("leave nothing pending after use", () => {
		const before = pendingParams();
		sql(`SELECT id FROM users WHERE id = ${sql.param(1)}`);
		sql.fragment(`AND id = ${sql.param(2)}`);
		expect(pendingParams()).toBe(before);
	});

	it("checks the full token prefix before looking up a pending value by id", () => {
		const before = pendingParams();
		const token: string = param(4);
		// Keep the id and token shape, but change the first digit of the random prefix.
		const foreign = `${token.slice(0, 8)}${token[8] === "0" ? "1" : "0"}${token.slice(9)}`;
		expect(takeValue(foreign)).toBe(foreign);
		expect(() => sql.as(`SELECT ${foreign}`)).toThrow(/NUL character/);
		expect(pendingParams()).toBe(before + 1);
		expect(sql.as(`SELECT ${token}`).values).toEqual([4]);
		expect(pendingParams()).toBe(before);
	});
});

describe("the token prefix", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.resetModules();
	});
	const tokenOf = async () => {
		vi.resetModules();
		const m = await import("../../src/runtime/inline.js");
		const token: string = m.param(1);
		expect(m.resolveInline(`SELECT ${token}`, 0)).toEqual({
			text: "SELECT $1",
			values: [1],
		});
		return token;
	};
	it("is 8 random bytes from crypto.getRandomValues", async () => {
		vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((a) => {
			(a as Uint8Array).fill(0xab);
			return a;
		});
		expect(await tokenOf()).toBe("\u0000typesqlabababababababab0\u0000");
	});
	it("comes from Math.random without crypto", async () => {
		vi.stubGlobal("crypto", undefined);
		vi.spyOn(Math, "random").mockReturnValue(0.01);
		expect(await tokenOf()).toBe("\u0000typesql02020202020202020\u0000");
	});
});
