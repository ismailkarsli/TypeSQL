import { expect, test } from "vitest";
import { mayBeInSqlLiteral } from "../src/literal.js";

const at = (marked: string): boolean => mayBeInSqlLiteral(marked.replace("|", ""), marked.indexOf("|"));

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
])("%s", (marked, want) => {
  expect(at(marked)).toBe(want);
});
