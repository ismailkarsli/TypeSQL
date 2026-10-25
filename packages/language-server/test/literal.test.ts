import { expect, test } from "vitest";
import { mayBeInSqlLiteral } from "../src/literal.js";

const at = (marked: string): boolean =>
	mayBeInSqlLiteral(marked.replace("|", ""), marked.indexOf("|"));

test.each([
	['sql("SELECT * FROM |', true],
	['sql("SELECT * FROM |")', true],
	["tx('SELECT u.| FROM users u')", true],
	["db.sql(`\n  SELECT *\n  FROM |\n`)", true],
	['sql.as<{ n: number }>("SELECT count(*) AS n FROM |', true],
	["sql(`SELECT * FROM users WHERE id = ${sql.param(1)} AND |`)", true],
	['sql("SELECT 1");\nconst x = |', false],
	['const s = "SELECT * FROM |"', false],
	['sql("a \\" b |', true],
	['sql("a"); f("b", |', false],
	["const a = 1 + |", false],
	// one-letter and digit-bearing callee names
	['f("SELECT * FROM |', true],
	['sql2("SELECT * FROM |', true],
	// a quoted literal ends at the end of its line, a template literal does not
	['sql("SELECT *\nFROM |', false],
	["sql('SELECT *\nFROM |", false],
	// the literal ends after an escape, or right after its opening quote
	['sql("a \\" b"); const x = |', false],
	['sql("a \\\\"); const x = |', false],
	['sql(""); const x = |', false],
])("%s", (marked, want) => {
	expect(at(marked)).toBe(want);
});

test("only the last 20000 characters before the cursor are read", () => {
	const filler = "x".repeat(25_000);
	expect(at(`sql("${filler}|`)).toBe(false);
	expect(at(`sql("|${filler}`)).toBe(true);
});
