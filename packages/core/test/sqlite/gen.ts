export interface Generated {
	readonly schema: string;
	readonly source: string;
	readonly sql: string;
}

type Rand = () => number;

function rng(seed: number): Rand {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

class Gen {
	readonly r: Rand;
	constructor(r: Rand) {
		this.r = r;
	}
	int(n: number): number {
		return Math.floor(this.r() * n);
	}
	pick<T>(xs: readonly T[]): T {
		return xs[this.int(xs.length)]!;
	}
	chance(p: number): boolean {
		return this.r() < p;
	}
	some<T>(xs: readonly T[], min: number, max: number): T[] {
		const n = min + this.int(max - min + 1);
		return Array.from({ length: n }, () => this.pick(xs));
	}
}

const T_COLS = [
	"id",
	"i",
	"ni",
	"r",
	"nr",
	"s",
	"ns",
	"b",
	"nb",
	"n",
	"nn",
	"d",
	"nd",
	"j",
	"nj",
	"u",
	"flag",
	"big",
	"dec",
];
const LITERALS = [
	"0",
	"1",
	"-1",
	"2",
	"7",
	"0.5",
	"-2.25",
	"1e3",
	"9223372036854775807",
	"'a'",
	"''",
	"'1'",
	"'2.5'",
	"'x1'",
	"' 3 '",
	"'2024-01-01'",
	`'{"a":1,"b":[1,2]}'`,
	"NULL",
	"x'01'",
	"x''",
	"TRUE",
	"FALSE",
	"CURRENT_DATE",
];
const BINARY = [
	"+",
	"-",
	"*",
	"/",
	"%",
	"||",
	"=",
	"==",
	"!=",
	"<>",
	"<",
	"<=",
	">",
	">=",
	"&",
	"|",
	"<<",
	">>",
	"AND",
	"OR",
	"IS",
	"IS NOT",
	"->",
	"->>",
];
const UNARY = ["-", "+", "~", "NOT "];
const FUNCTIONS: readonly (readonly [string, number, number])[] = [
	["abs", 1, 1],
	["coalesce", 2, 3],
	["ifnull", 2, 2],
	["nullif", 2, 2],
	["iif", 3, 3],
	["length", 1, 1],
	["octet_length", 1, 1],
	["lower", 1, 1],
	["upper", 1, 1],
	["trim", 1, 2],
	["ltrim", 1, 1],
	["substr", 2, 3],
	["replace", 3, 3],
	["instr", 2, 2],
	["round", 1, 2],
	["max", 2, 3],
	["min", 2, 3],
	["typeof", 1, 1],
	["hex", 1, 1],
	["quote", 1, 1],
	["unicode", 1, 1],
	["char", 1, 2],
	["sign", 1, 1],
	["ceil", 1, 1],
	["floor", 1, 1],
	["trunc", 1, 1],
	["sqrt", 1, 1],
	["ln", 1, 1],
	["pow", 2, 2],
	["mod", 2, 2],
	["concat", 1, 3],
	["concat_ws", 2, 3],
	["format", 1, 2],
	["date", 1, 2],
	["datetime", 1, 1],
	["julianday", 1, 1],
	["unixepoch", 1, 1],
	["strftime", 2, 2],
	["json", 1, 1],
	["json_extract", 2, 2],
	["json_type", 1, 2],
	["json_valid", 1, 1],
	["json_array", 0, 2],
	["json_object", 2, 2],
	["json_array_length", 1, 1],
	["json_quote", 1, 1],
	["likely", 1, 1],
	["unhex", 1, 1],
];
const CASTS = [
	"INTEGER",
	"INT",
	"REAL",
	"TEXT",
	"BLOB",
	"NUMERIC",
	"VARCHAR(10)",
	"DATETIME",
	"BOOLEAN",
];

function expr(g: Gen, depth: number, cols: readonly string[]): string {
	if (depth <= 0 || g.chance(0.3))
		return g.chance(0.55) ? g.pick(cols) : g.pick(LITERALS);
	const sub = (): string => expr(g, depth - 1, cols);
	switch (g.int(11)) {
		case 0:
		case 1:
		case 2:
			return `(${sub()} ${g.pick(BINARY)} ${sub()})`;
		case 3:
			return `${g.pick(UNARY)}${sub()}`;
		case 4:
		case 5: {
			const [name, min, max] = g.pick(FUNCTIONS);
			const n = min + g.int(max - min + 1);
			return `${name}(${Array.from({ length: n }, sub).join(", ")})`;
		}
		case 6:
			return `CASE ${g.chance(0.3) ? `${sub()} ` : ""}WHEN ${sub()} THEN ${sub()}${g.chance(0.6) ? ` ELSE ${sub()}` : ""} END`;
		case 7:
			return `CAST(${sub()} AS ${g.pick(CASTS)})`;
		case 8:
			return g.pick([
				`${sub()} IS NULL`,
				`${sub()} NOTNULL`,
				`${sub()} IN (${sub()}, ${sub()})`,
				`${sub()} BETWEEN ${sub()} AND ${sub()}`,
				`${sub()} LIKE ${sub()}`,
				`${sub()} GLOB ${sub()}`,
				`${sub()} COLLATE NOCASE`,
			]);
		case 9:
			return `(SELECT ${g.pick(["max", "min", "sum", "count", "avg", "total"])}(${g.pick(cols)}) FROM t)`;
		default:
			return `EXISTS (SELECT 1 FROM t WHERE ${sub()})`;
	}
}

function expressions(g: Gen): string {
	const items = Array.from({ length: 1 + g.int(3) }, () => expr(g, 3, T_COLS));
	const where = g.chance(0.3) ? ` WHERE ${expr(g, 2, T_COLS)}` : "";
	const agg = g.chance(0.15)
		? `, ${g.pick(["count", "sum", "max", "min", "avg", "total", "group_concat"])}(${expr(g, 1, T_COLS)})`
		: "";
	return `SELECT ${items.join(", ")}${agg} FROM t${where}`;
}

const USERS = [
	"u.id",
	"u.email",
	"u.name",
	"u.score",
	"u.created_at",
	"u.active",
];
const POSTS = [
	"p.id",
	"p.user_id",
	"p.title",
	"p.body",
	"p.meta",
	"p.data",
	"p.views",
];
const AGGS = ["count", "sum", "max", "min", "avg", "total", "group_concat"];

function shape(g: Gen): string {
	const join = g.pick([
		"",
		" JOIN posts p ON p.user_id = u.id",
		" LEFT JOIN posts p ON p.user_id = u.id",
		" RIGHT JOIN posts p ON p.user_id = u.id",
		" FULL JOIN posts p ON p.user_id = u.id",
		" CROSS JOIN posts p",
		" LEFT JOIN posts p USING (id)",
	]);
	const cols = join ? [...USERS, ...POSTS] : USERS;
	const grouped = g.chance(0.3);
	const key = g.chance(0.6) ? "u.id" : g.pick(cols);
	const items = grouped
		? [
				key,
				...g.some(cols, 1, 2).map((c) => `${g.pick(AGGS)}(${c})`),
				...(g.chance(0.3) ? ["count(*)"] : []),
			]
		: g.chance(0.15)
			? g.some(cols, 0, 1).concat(`${g.pick(AGGS)}(${g.pick(cols)})`)
			: g.some(cols, 1, 4).map((c) => (g.chance(0.2) ? expr(g, 1, [c]) : c));
	if (g.chance(0.1))
		items.push(
			`${g.pick(["row_number()", "rank()", `lag(${g.pick(cols)})`, `sum(${g.pick(cols)})`])} OVER (${g.chance(0.4) ? `PARTITION BY ${g.pick(cols)} ` : ""}ORDER BY ${g.pick(cols)})`,
		);
	if (g.chance(0.1))
		items.push(
			`(SELECT ${g.pick(["count(*)", "max(p2.views)", "p2.title"])} FROM posts p2 WHERE p2.user_id = u.id)`,
		);
	const where = g.chance(0.4)
		? ` WHERE ${g.pick([
				`${g.pick(cols)} IS NOT NULL`,
				`${g.pick(cols)} IS NULL`,
				`${g.pick(cols)} = $1`,
				`${g.pick(cols)} > 0`,
				`u.id IN (SELECT user_id FROM posts)`,
				expr(g, 1, cols),
			])}`
		: "";
	const group = grouped
		? ` GROUP BY ${key}${g.chance(0.3) ? ` HAVING ${g.pick(["count(*) > 1", "u.id > 0", `max(${g.pick(cols)}) IS NOT NULL`])}` : ""}`
		: "";
	const order = g.chance(0.4)
		? ` ORDER BY ${g.pick([
				"1",
				g.pick(cols),
				`${g.pick(cols)} DESC NULLS LAST`,
				`${g.pick(cols)}, ${g.pick(cols)} ASC`,
				expr(g, 1, cols),
			])}`
		: "";
	const limit = g.chance(0.2) ? ` LIMIT ${g.int(3)}` : "";
	const select = `SELECT ${g.chance(0.1) ? "DISTINCT " : ""}${items.join(", ")} FROM users u${join}${where}${group}${order}${limit}`;
	switch (g.int(10)) {
		case 0:
			return `WITH c AS (${select}) SELECT * FROM c`;
		case 1:
			return `SELECT * FROM (${select}) AS x`;
		case 2:
			return `SELECT id, email FROM users ${g.pick(["UNION", "UNION ALL", "INTERSECT", "EXCEPT"])} SELECT ${g.pick(["user_id", "id", "NULL", "views"])}, ${g.pick(["title", "body", "NULL", "meta"])} FROM posts`;
		case 3:
			return g.pick([
				`INSERT INTO posts (user_id, title${g.chance(0.5) ? ", body" : ""}) VALUES (1, 'x'${g.chance(0.5) ? ", NULL" : ""}) RETURNING ${g.some(["id", "views", "body", "*", "title || id"], 1, 2).join(", ")}`,
				`UPDATE posts SET views = views + 1${g.chance(0.5) ? " WHERE id = $1" : ""} RETURNING ${g.some(["id", "views", "meta", "*"], 1, 2).join(", ")}`,
				`DELETE FROM posts WHERE ${g.pick(["id = 1", "body IS NULL", "user_id = $1"])} RETURNING ${g.some(["id", "title", "body"], 1, 2).join(", ")}`,
				`INSERT INTO users (email) VALUES ('n@x') ON CONFLICT (email) DO UPDATE SET name = excluded.email RETURNING id, name`,
				`INSERT INTO tags (post_id, tag) SELECT p.id, ${g.pick(["p.title", "p.body", "u.email"])} FROM posts p JOIN users u ON u.id = p.user_id WHERE true ON CONFLICT DO NOTHING RETURNING *`,
				`UPDATE users AS x SET name = p.title FROM posts p WHERE p.user_id = x.id RETURNING x.id, ${g.pick(["p.title", "p.body", "x.name", "p.views"])}`,
			]);
		case 4:
			return `SELECT ${g.some(["j.key", "j.value", "j.type", "j.atom", "j.path", "p.id"], 1, 3).join(", ")} FROM posts p, ${g.pick(["json_each", "json_tree"])}(p.meta) AS j${g.chance(0.4) ? " WHERE j.type = 'integer'" : ""}`;
		default:
			return select;
	}
}

export function generate(seed: number, runs: number): Generated[] {
	const g = new Gen(rng(seed));
	return Array.from({ length: runs }, () =>
		g.chance(0.5)
			? {
					schema: "types",
					source: `fuzz ${seed} expressions`,
					sql: expressions(g),
				}
			: { schema: "app", source: `fuzz ${seed} shapes`, sql: shape(g) },
	);
}
