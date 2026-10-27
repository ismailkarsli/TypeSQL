import { describe, expect, it } from "vitest";
import { createSql } from "../../src/index.js";
import { isSlottable } from "../../src/query.js";
import {
	joinFragments,
	maxParam,
	memo,
	quoteIdent,
	renumberParams,
	rewriteNamed,
	splice,
} from "../../src/runtime/splice.js";

describe("renumberParams", () => {
	it("offsets placeholders outside literals and comments", () => {
		expect(renumberParams("a = $1 AND b = $2", 2)).toBe("a = $3 AND b = $4");
		expect(
			renumberParams(
				"a = '$1' AND b = $1 -- $9\n AND c = $2 /* $8 */ AND d = $$ $7 $$",
				10,
			),
		).toBe(
			"a = '$1' AND b = $11 -- $9\n AND c = $12 /* $8 */ AND d = $$ $7 $$",
		);
		expect(renumberParams('x = "we""ird$1" AND y = $1', 1)).toBe(
			'x = "we""ird$1" AND y = $2',
		);
		expect(renumberParams("$10 $1", 1)).toBe("$11 $2");
	});
	it("maxParam ignores literals", () => {
		expect(maxParam("SELECT $2, '$9', $1")).toBe(2);
		expect(maxParam("SELECT 1")).toBe(0);
		expect(maxParam("SELECT 'x', $$ $3 $$")).toBe(0);
		expect(maxParam("SELECT $10, $9")).toBe(10);
	});
	// [text, text with every $n outside literals and comments offset by 1]
	const cases = [
		["'$1' $1", "'$1' $2"],
		["'it''s $1' $1", "'it''s $1' $2"],
		["'' $1 ''", "'' $2 ''"],
		["$1 '$1", "$2 '$1"],
		["$1 'it''", "$2 'it''"],
		['"$1" $1', '"$1" $2'],
		['"we""ird $1" $1', '"we""ird $1" $2'],
		['"" $1', '"" $2'],
		['$1 "$1', '$2 "$1'],
		["-- $1\n$1", "-- $1\n$2"],
		["$1 -- $1", "$2 -- $1"],
		["-$1 - $1", "-$2 - $2"],
		["/* $1 */ $1 /* $1 */", "/* $1 */ $2 /* $1 */"],
		["$1 /* $1", "$2 /* $1"],
		["/*/ $1", "/*/ $1"],
		["/ $1 * $1 */", "/ $2 * $2 */"],
		["$$ $1 $$ $1 $$ $1 $$", "$$ $1 $$ $2 $$ $1 $$"],
		["$a$ $1 $$ $1 $b$ $1 $a$ $1", "$a$ $1 $$ $1 $b$ $1 $a$ $2"],
		["$1 $$ $1", "$2 $$ $1"],
		["$1 $a$ $1 $a", "$2 $a$ $1 $a"],
		["$a $1 a$ $1", "$a $2 a$ $2"],
		["$1a$ $1", "$2a$ $2"],
		["$ $1 $", "$ $2 $"],
		["$10 $1", "$11 $2"],
	] as const;
	it.each(cases)("%j → %j", (text, expected) => {
		expect(renumberParams(text, 1)).toBe(expected);
	});
	it("reads a dollar-quote tag as the types do: a letter or _, then letters, digits, _", () => {
		for (const tag of [
			"A",
			"Z",
			"a",
			"z",
			"_",
			"xA",
			"xZ",
			"xa",
			"xz",
			"x0",
			"x9",
			"x_",
		])
			expect(renumberParams(`$${tag}$ $1 $${tag}$ $1`, 1)).toBe(
				`$${tag}$ $1 $${tag}$ $2`,
			);
	});
	it("keeps a text without an offset", () => {
		expect(renumberParams("$1 $2", 0)).toBe("$1 $2");
	});
});

describe("memo", () => {
	it("computes once per argument, and starts over at its limit", () => {
		const calls: string[] = [];
		const upper = memo((s: string) => {
			calls.push(s);
			return s.toUpperCase();
		}, 2);
		expect(upper("a")).toBe("A");
		expect(upper("a")).toBe("A");
		expect(upper("b")).toBe("B");
		expect(upper("a")).toBe("A");
		expect(upper("b")).toBe("B");
		expect(calls).toEqual(["a", "b"]);
		// the memo holds 2: c clears it and is kept alone
		expect(upper("c")).toBe("C");
		expect(upper("c")).toBe("C");
		expect(calls).toEqual(["a", "b", "c"]);
		expect(upper("a")).toBe("A");
		expect(calls).toEqual(["a", "b", "c", "a"]);
	});
});

describe("splice", () => {
	it("replaces slots, renumbers and appends values", () => {
		const r = splice(
			"SELECT * FROM t WHERE a = $1 {w} {o}",
			{
				w: { text: "AND b = $1 AND c = $2", values: ["b", "c"] },
				o: { text: "ORDER BY $1", values: [3] },
			},
			["a"],
		);
		expect(r.text).toBe(
			"SELECT * FROM t WHERE a = $1 AND b = $2 AND c = $3 ORDER BY $4",
		);
		expect(r.values).toEqual(["a", "b", "c", 3]);
	});
	it("leaves non-identifier braces alone and throws on unknown slots", () => {
		expect(
			splice(
				"SELECT '{1,2}'::int[] {a}",
				{ a: { text: "AS x", values: [] } },
				[],
			).text,
		).toBe("SELECT '{1,2}'::int[] AS x");
		expect(() => splice("SELECT {nope}", {}, [])).toThrow(
			/unknown fragment slot/,
		);
	});
});

describe("helpers", () => {
	it("quoteIdent", () => {
		expect(quoteIdent("a")).toBe('"a"');
		expect(quoteIdent("s", 'we"ird')).toBe('"s"."we""ird"');
	});
	it("joinFragments renumbers left to right", () => {
		const r = joinFragments(
			[
				{ text: "a = $1", values: [1] },
				{ text: "b = $1 AND c = $2", values: [2, 3] },
			],
			" AND ",
		);
		expect(r).toEqual({
			text: "a = $1 AND b = $2 AND c = $3",
			values: [1, 2, 3],
		});
	});
});

describe("createSql runtime", () => {
	interface DB {
		users: {
			id: { type: "int4"; nullable: false; hasDefault: true };
			email: { type: "text"; nullable: false; hasDefault: false };
		};
	}
	const sql = createSql<DB>();
	it("builds plain queries", () => {
		expect(sql("SELECT id FROM users WHERE id = $1", 7)).toEqual({
			text: "SELECT id FROM users WHERE id = $1",
			values: [7],
		});
	});
	it("splices fragments", () => {
		const where = sql.fragment("WHERE id = $1", 7);
		const q = sql("SELECT id FROM users {where}", { where });
		expect(q).toEqual({
			text: "SELECT id FROM users WHERE id = $1",
			values: [7],
		});
		const q2 = sql(
			"SELECT id FROM users WHERE email = $1 {more}",
			{ more: sql.fragment("AND id > $1", 3) },
			"e",
		);
		expect(q2).toEqual({
			text: "SELECT id FROM users WHERE email = $1 AND id > $2",
			values: ["e", 3],
		});
	});
	it("id, join, raw, as", () => {
		expect(sql.id("a", "b")).toEqual({ text: '"a"."b"', values: [] });
		expect(
			sql.combine([sql.fragment("x = $1", 1), sql.fragment("y = $1", 2)], {
				separator: " OR ",
			}),
		).toEqual({ text: "x = $1 OR y = $2", values: [1, 2] });
		expect(sql.raw("WHERE 1=1")).toEqual({ text: "WHERE 1=1", values: [] });
		expect(
			sql.as<{ id: number }>("SELECT id FROM users {r}", {
				r: sql.raw("WHERE 1=1"),
			}),
		).toEqual({ text: "SELECT id FROM users WHERE 1=1", values: [] });
		// an object param without slots in the text is a value, not a slot map
		expect(sql.as<{ id: number }>("SELECT $1::jsonb", { a: 1 })).toEqual({
			text: "SELECT $1::jsonb",
			values: [{ a: 1 }],
		});
		// braces in a literal look like a slot; the first argument is still a value unless every
		// member of it is a fragment
		expect(sql.as("SELECT '{a}'::text[], $1::int", 5)).toEqual({
			text: "SELECT '{a}'::text[], $1::int",
			values: [5],
		});
		expect(sql.as("SELECT '{a}'::text[] WHERE id = :id", { id: 5 })).toEqual({
			text: "SELECT '{a}'::text[] WHERE id = $1",
			values: [5],
		});
		const forged = { email: { text: "x' OR true --", values: [] } };
		expect(
			sql.as("SELECT * FROM users WHERE profile #>> '{email}' = $1", forged),
		).toEqual({
			text: "SELECT * FROM users WHERE profile #>> '{email}' = $1",
			values: [forged],
		});
		expect(
			sql.as("SELECT * FROM users WHERE profile #>> '{email}' = $1", {}),
		).toEqual({
			text: "SELECT * FROM users WHERE profile #>> '{email}' = $1",
			values: [{}],
		});
		const authenticQuery = sql.as("SELECT 1 AS x");
		expect(isSlottable(authenticQuery)).toBe(true);
		expect(
			sql.as("SELECT * FROM ({sub}) AS t", { sub: authenticQuery }),
		).toEqual({
			text: "SELECT * FROM (SELECT 1 AS x) AS t",
			values: [],
		});
		expect(isSlottable(forged.email)).toBe(false);
		expect(isSlottable(null)).toBe(false);
		expect(isSlottable({})).toBe(false);
	});

	it(":name parameters take exactly one object argument", () => {
		const message =
			"typesql: a statement with :name parameters takes exactly one object argument";
		expect(() => sql.as("SELECT :id")).toThrow(message);
		expect(() => sql.as("SELECT :id", { id: 1 }, 2)).toThrow(message);
		expect(() => sql.as("SELECT :id", null)).toThrow(message);
		expect(() => sql.as("SELECT :id", 1)).toThrow(message);
	});
});

describe("sql.combine over an array", () => {
	interface DB {
		users: {
			id: { type: "int4"; nullable: false; hasDefault: true };
			email: { type: "text"; nullable: false; hasDefault: false };
		};
	}
	const sql = createSql<DB>();
	const SORT = {
		id: sql.fragment("id DESC"),
		email: sql.fragment("email"),
		near: sql.fragment("abs(id - $1)", 5),
	} as const;
	it("joins a runtime array, repeating and renumbering elements", () => {
		const keys: (keyof typeof SORT)[] = ["near", "email", "near"];
		const order = sql.combine(keys.map((k) => SORT[k]));
		expect(order).toEqual({
			text: "abs(id - $1), email, abs(id - $2)",
			values: [5, 5],
		});
		const q = sql(
			"SELECT id FROM users WHERE id > $1 ORDER BY {order}",
			{ order },
			0,
		);
		expect(q).toEqual({
			text: "SELECT id FROM users WHERE id > $1 ORDER BY abs(id - $2), email, abs(id - $3)",
			values: [0, 5, 5],
		});
		expect(
			sql.combine([SORT.id, SORT.email], { separator: " AND " }).text,
		).toBe("id DESC AND email");
		expect(sql.combine([SORT.id, SORT.email], { separator: " / " }).text).toBe(
			"id DESC / email",
		);
	});
	it("throws on an empty array", () => {
		expect(() => sql.combine([])).toThrow(
			/sql.combine\(\) needs at least one item/,
		);
	});
});

describe("named parameters", () => {
	interface DB {
		users: {
			id: { type: "int4"; nullable: false; hasDefault: true };
			email: { type: "text"; nullable: false; hasDefault: false };
		};
	}
	const sql = createSql<DB>();
	it("rewrites :name to $n in first-appearance order and builds values from the object", () => {
		const q = sql(
			"SELECT id FROM users WHERE id = :id AND email = :email OR id = :id",
			{ id: 1, email: "x" },
		);
		expect(q).toEqual({
			text: "SELECT id FROM users WHERE id = $1 AND email = $2 OR id = $1",
			values: [1, "x"],
		});
	});
	it("ignores casts, := and literals", () => {
		const q = sql(
			"SELECT id::text AS t, 'a:b' AS s FROM users WHERE id = :id",
			{ id: 3 },
		);
		expect(q).toEqual({
			text: "SELECT id::text AS t, 'a:b' AS s FROM users WHERE id = $1",
			values: [3],
		});
	});
	it("reads only a colon directly followed by a name as a parameter, as the types do", () => {
		expect(
			rewriteNamed(
				"SELECT tags[1: n], tags[1:2], json_object('a': id), json_object('b':'c'), f(d := :d, h:=:h), id AS x$y WHERE id = :id",
			),
		).toEqual({
			text: "SELECT tags[1: n], tags[1:2], json_object('a': id), json_object('b':'c'), f(d := $1, h:=$2), id AS x$y WHERE id = $3",
			names: ["d", "h", "id"],
		});
		expect(rewriteNamed("SELECT x$,y$ FROM s(x$, y$) WHERE x$ = :id")).toEqual({
			text: "SELECT x$,y$ FROM s(x$, y$) WHERE x$ = $1",
			names: ["id"],
		});
		expect(rewriteNamed("SELECT tags[1:n]")).toEqual({
			text: "SELECT tags[1$1]",
			names: ["n"],
		});
	});
	it("reads a name as the types do: a letter or _, then letters, digits, _", () => {
		expect(
			rewriteNamed(":A :Z :a :z :_ :xA :xZ :xa :xz :x0 :x9 :x_ :x- :0 :xA"),
		).toEqual({
			text: "$1 $2 $3 $4 $5 $6 $7 $8 $9 $10 $11 $12 $13- :0 $6",
			names: [
				"A",
				"Z",
				"a",
				"z",
				"_",
				"xA",
				"xZ",
				"xa",
				"xz",
				"x0",
				"x9",
				"x_",
				"x",
			],
		});
	});
	it("never reads a colon right after another one as a parameter", () => {
		expect(rewriteNamed("SELECT 1::int, :::a, ::::b, :c")).toEqual({
			text: "SELECT 1::int, :::a, ::::b, $1",
			names: ["c"],
		});
	});
	it("throws on missing names", () => {
		expect(() => sql.as("SELECT :a, :b", { a: 1 })).toThrow(
			/missing named parameter :b/,
		);
	});
	it("leaves :name inside literals, quoted identifiers, comments and dollar quotes as text", () => {
		const keep = (text: string) =>
			expect(rewriteNamed(`${text} = :id`)).toEqual({
				text: `${text} = $1`,
				names: ["id"],
			});
		keep("SELECT ':x'");
		keep('SELECT ":x"');
		keep("SELECT 1 -- :x\n");
		keep("SELECT 1 /* :x */");
		keep("SELECT $$ :x $$");
		keep("SELECT $body$ :x $$ :y $body$");
		keep("SELECT ':x'':y'");
		keep("SELECT '', ''");
		keep('SELECT ":x"":y"');
		keep("SELECT 1 /* :x */ + 1 /* :y */");
		keep("SELECT $$ :x $$ + $$ :y $$");
		keep("SELECT $a$ :x $a$ + $b$ :y $b$");
		expect(rewriteNamed(":a ':b")).toEqual({ text: "$1 ':b", names: ["a"] });
		expect(rewriteNamed(':a ":b')).toEqual({ text: '$1 ":b', names: ["a"] });
		expect(rewriteNamed(":a -- :b")).toEqual({
			text: "$1 -- :b",
			names: ["a"],
		});
		expect(rewriteNamed(":a /* :b")).toEqual({
			text: "$1 /* :b",
			names: ["a"],
		});
		expect(rewriteNamed(":a $$ :b")).toEqual({
			text: "$1 $$ :b",
			names: ["a"],
		});
		expect(rewriteNamed(":a $x$ :b $x")).toEqual({
			text: "$1 $x$ :b $x",
			names: ["a"],
		});
		expect(rewriteNamed("DO $$ BEGIN PERFORM :x; END $$")).toEqual({
			text: "DO $$ BEGIN PERFORM :x; END $$",
			names: [],
		});
	});
	it("combines with fragments", () => {
		const where = sql.fragment("WHERE id > :min", { min: 18 });
		expect(where).toEqual({ text: "WHERE id > $1", values: [18] });
		const q = sql("SELECT id FROM users u {where}", { where });
		expect(q).toEqual({
			text: "SELECT id FROM users u WHERE id > $1",
			values: [18],
		});
		const more = sql.fragment("AND id > :min", { min: 18 });
		const q2 = sql(
			"SELECT id FROM users u WHERE email = :email {more}",
			{ more },
			{ email: "e" },
		);
		expect(q2).toEqual({
			text: "SELECT id FROM users u WHERE email = $1 AND id > $2",
			values: ["e", 18],
		});
	});
});

describe("text plans are remembered per text", () => {
	interface DB {
		users: {
			id: { type: "int4"; nullable: false; hasDefault: true };
			email: { type: "text"; nullable: false; hasDefault: false };
		};
	}
	it("the same text with other fragments, values and offsets", () => {
		const sql = createSql<DB>();
		const text = "SELECT u.id FROM users u {where} AND u.email = $1";
		const a = sql.fragment("WHERE u.id > $1", 1);
		const b = sql.fragment("WHERE u.id > $1 AND u.id < $2", 1, 9);
		expect(sql(text, { where: a }, "x")).toEqual({
			text: "SELECT u.id FROM users u WHERE u.id > $2 AND u.email = $1",
			values: ["x", 1],
		});
		expect(sql(text, { where: b }, "y")).toEqual({
			text: "SELECT u.id FROM users u WHERE u.id > $2 AND u.id < $3 AND u.email = $1",
			values: ["y", 1, 9],
		});
		expect(sql(text, { where: a }, "z")).toEqual({
			text: "SELECT u.id FROM users u WHERE u.id > $2 AND u.email = $1",
			values: ["z", 1],
		});
		// the fragment again, at another offset
		expect(sql("SELECT 1 FROM users u {where}", { where: a })).toEqual({
			text: "SELECT 1 FROM users u WHERE u.id > $1",
			values: [1],
		});
		expect(splice("{x} {x}", { x: { text: "$1", values: [5] } }, [])).toEqual({
			text: "$1 $2",
			values: [5, 5],
		});
	});

	it("named parameters: the rewrite is shared, the values are not", () => {
		const sql = createSql<DB>();
		const text = "SELECT id FROM users WHERE email = :email AND id > :min";
		expect(sql(text, { email: "a", min: 1 })).toEqual({
			text: "SELECT id FROM users WHERE email = $1 AND id > $2",
			values: ["a", 1],
		});
		expect(sql(text, { email: "b", min: 2 })).toEqual({
			text: "SELECT id FROM users WHERE email = $1 AND id > $2",
			values: ["b", 2],
		});
		// @ts-expect-error -- :min is missing
		expect(() => sql(text, { email: "c" })).toThrow(
			"missing named parameter :min",
		);
	});
});
