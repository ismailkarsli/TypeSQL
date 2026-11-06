import { DatabaseSync } from "node:sqlite";
import { createSql } from "@typesql/sqlite";

const db = new DatabaseSync(process.env.SQLITE_PATH!);
const sql = createSql<{}>(db);

// SQLite text: names quoted with backticks or brackets hold no parameters,
// and a block comment ends at the first `*/`, as SQLite doesn't nest them.
const columns = sql.raw("1 AS `a:b`, 2 AS [c:d], 3 AS [$1]");
export const row = await sql
	.as<{
		first: number;
		"a:b": number;
		"c:d": number;
		$1: number;
		last: number;
	}>(`SELECT $1 AS first, ${columns} /* /* */, ${sql.param(20)} AS last`, 10)
	.executeTakeFirstOrThrow();
console.log(row);

// sql() reads its text, and that of its fragments, by the same rules.
export const backticks = await sql("SELECT 1 AS `a:b`, :y + 0 AS y", {
	y: 2,
}).executeTakeFirstOrThrow();
export const brackets = await sql(
	"SELECT 2 AS [c:d], 3 AS [it's], :y + 0 AS y",
	{
		y: 2,
	},
).executeTakeFirstOrThrow();
export const blockComment = await sql("SELECT /* /* */ :y + 0 AS y", {
	y: 2,
}).executeTakeFirstOrThrow();
const dollar = sql.fragment("1 AS [$2], $1 + 0 AS a", 10);
export const quotedDollar = await sql(
	`SELECT ${dollar}`,
).executeTakeFirstOrThrow();
const pair = sql.combine([
	sql.fragment("$1 + 0 AS [$1 a]", 1),
	sql.fragment("$1 + 0 AS [$1 b]", 2),
]);
export const combined = await sql(`SELECT ${pair}`).executeTakeFirstOrThrow();
// A JSON array's parameter, whose type TypeSQL writes with brackets, is no
// bracket-quoted name.
export const jsonArray = await sql(
	`SELECT json_array_length(${sql.json([1, 2])}) AS n, 3 AS [c:d]`,
).executeTakeFirstOrThrow();
console.log({
	backticks,
	brackets,
	blockComment,
	quotedDollar,
	combined,
	jsonArray,
});
db.close();
