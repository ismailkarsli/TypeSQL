import { createSql } from "@typesql/mysql";
import { createPool } from "mysql2/promise";

const pool = createPool({ uri: process.env.DATABASE_URL! });
const sql = createSql<{}>(pool);

// MySQL text: a backtick-quoted name, a string with a backslash escape and a
// `#` comment hold no parameters, and a block comment ends at the first
// `*/`, as MySQL doesn't nest them.
const columns = sql.raw(
	"1 AS `a:b`, 'it\\'s :x' AS s, '\\\\' AS backslash, 2 AS `$1` # not :y\n",
);
export const row = await sql
	.as<{
		first: number;
		"a:b": number;
		s: string;
		backslash: string;
		$1: number;
		last: number;
	}>(`SELECT $1 AS first, ${columns} /* /* */, ${sql.param(20)} AS last`, 10)
	.executeTakeFirstOrThrow();
console.log(row);

// sql() reads its text, and that of its fragments, by the same rules.
export const quotedName = await sql("SELECT 1 AS `a:b`, :y + 0 AS y", {
	y: 2,
}).executeTakeFirstOrThrow();
export const escapedQuote = await sql(
	'SELECT \'it\\\'s :x\' AS s, "say \\"hi:x\\"" AS d, :y + 0 AS y',
	{ y: 2 },
).executeTakeFirstOrThrow();
export const hashComment = await sql("SELECT 1 AS a # not :x\n, :y + 0 AS y", {
	y: 2,
}).executeTakeFirstOrThrow();
export const doubleMinus = await sql("SELECT 5--1 AS dash, :y + 0 AS y", {
	y: 2,
}).executeTakeFirstOrThrow();
export const blockComment = await sql("SELECT /* /* */ :y + 0 AS y", {
	y: 2,
}).executeTakeFirstOrThrow();
const dollar = sql.fragment("1 AS `$2`, $1 + 0 AS a", 10);
export const quotedDollar = await sql(
	`SELECT ${dollar}`,
).executeTakeFirstOrThrow();
const name = sql.fragment("1 AS `a:b`, :y + 0 AS y", { y: 2 });
export const fragment = await sql(
	`SELECT ${name}, ${sql.param(3)} + 0 AS z`,
).executeTakeFirstOrThrow();
const pair = sql.combine([
	sql.fragment("$1 + 0 AS `$1 a`", 1),
	sql.fragment("$1 + 0 AS `$1 b`", 2),
]);
export const combined = await sql(`SELECT ${pair}`).executeTakeFirstOrThrow();
console.log({
	quotedName,
	escapedQuote,
	hashComment,
	doubleMinus,
	blockComment,
	quotedDollar,
	fragment,
	combined,
});
await pool.end();
