import { API } from "typescript/sync";
import { afterAll, describe, expect, test } from "vitest";
import { findViolations } from "./check-expect-error.ts";

const api = new API({ cwd: import.meta.dirname });
afterAll(() => api.close());

const check = (text: string): string[] =>
	findViolations(api, "/virtual/x.test-d.ts", text).map(
		({ line, kind }) => `${line}:${kind}`,
	);

describe("flagged", () => {
	test("a Row or RowOf assertion after @ts-expect-error", () => {
		expect(
			check(`
// @ts-expect-error JSON() needs an argument
expectTypeOf<Row<"SELECT JSON()">>().toEqualTypeOf<{}>();
// @ts-expect-error
expectTypeOf<RowOf<DB, TM, "SELECT nope FROM t">>().toEqualTypeOf<{}>();
  /* @ts-expect-error qualified, and the statement continues on the next lines */
  expectTypeOf<core.RowOf<DB, TM, "SELECT x">>()
    .toEqualTypeOf<{}>();
`),
		).toEqual(["2:row", "4:row", "6:row"]);
	});

	test("sql() of a statement without parameters, also wsql() and in a declaration", () => {
		expect(
			check(`
test("x", () => {
  // @ts-expect-error unknown column
  sql("SELECT nope FROM users");
  // @ts-expect-error
  const q = wsql(\`DELETE FROM active_users\`);
  // @ts-expect-error
  expectTypeOf(sql("SELECT 'a::b', x::int FROM t")).toBeObject();
});
`),
		).toEqual(["3:sql", "5:sql", "7:sql"]);
	});

	test("an SqlError without its message, with or without @ts-expect-error", () => {
		expect(
			check(`
expectTypeOf<Validate<DB, "SELECT id FROM User">>().toExtend<SqlError<string, number>>();
type E = SqlError;
expectTypeOf<V<"SELECT 1">>().toEqualTypeOf<SqlError<"exact", 0>>();
`),
		).toEqual(["2:loose", "3:loose"]);
	});
});

describe("not flagged", () => {
	test("argument-shape errors: wrong parameter values or object, missing argument", () => {
		expect(
			check(`
// @ts-expect-error wrong type for a named parameter
sql("SELECT id FROM users WHERE id = :id", { id: "1" });
// @ts-expect-error wrong param type
sql("DELETE FROM users WHERE id = $1", "1");
// @ts-expect-error missing param
sql("INSERT INTO users (email) VALUES ($1)");
// @ts-expect-error missing named param
sql("SELECT id FROM users WHERE id = :id");
// @ts-expect-error a slot without its fragment
sql("SELECT id FROM users {where}");
// @ts-expect-error an inline parameter of the wrong type
sql(\`SELECT id FROM users WHERE id = \${sql.param("5")}\`);
// @ts-expect-error a plain string variable
sql(someText);
// @ts-expect-error missing value for $1
sql.fragment("AND age > $1");
// @ts-expect-error not a rowKeys option
createSql<DB>(executor, { rowKeys: "snake_case" });
// @ts-expect-error relation "users" already exists
m.add("CREATE TABLE users (id int)");
`),
		).toEqual([]);
	});

	test("a directive inside a call pins where the error lands", () => {
		expect(
			check(`
sql(
  // @ts-expect-error relation "usrs" does not exist
  "SELECT id FROM usrs",
);
`),
		).toEqual([]);
	});

	test("the directive's text in a string, a template or a block comment that is not a directive", () => {
		expect(
			check(`
const a = "// @ts-expect-error";
const b = \`
// @ts-expect-error
\`;
sql("SELECT nope FROM users");
`),
		).toEqual([]);
	});

	test("Row and sql() on a later line, or the exact SqlError", () => {
		expect(
			check(`
// @ts-expect-error
foo();
expectTypeOf<Row<"SELECT JSON()">>().toEqualTypeOf<{}>();
// @ts-expect-error

sql("SELECT nope FROM users");
expectTypeOf<V<"SELECT JSON()">>().toEqualTypeOf<SqlError<"function json() does not exist", 7>>();
`),
		).toEqual([]);
	});
});
