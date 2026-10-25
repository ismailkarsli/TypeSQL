import { describe, expect, test } from "vitest";
import {
	parseNodeTree,
	type QueryFn,
	ViewNullability,
} from "../../src/introspect/nullability.js";

/**
 * View nullability over hand-written query trees: the shapes of older PostgreSQL releases
 * (no `varnullingrels` before 16, unmarked grouping sets before 18) and trees the analysis does
 * not know, which must read as nullable rather than fail. `introspect.test.ts` checks the
 * analysis against the views of a real PostgreSQL.
 */

/** Table 10 has one NOT NULL column. */
const TABLE = "{RANGETBLENTRY :rtekind 0 :relid 10}";
const column = (expr: string, name = "c") =>
	`{TARGETENTRY :expr ${expr} :resname ${name} :resjunk false}`;
const variable = (varno: number, attno: number, nullingrels = "(b)") =>
	`{VAR :varno ${varno} :varattno ${attno} :varnullingrels ${nullingrels} :varlevelsup 0}`;
const NULL = "{CONST :constisnull true :constvalue <>}";
const ONE = "{CONST :constisnull false :constvalue 4 [ 1 0 0 0 ]}";
const query = (
	columns: readonly string[],
	rtable: readonly string[] = [],
	extra = "",
) =>
	`({QUERY :rtable (${rtable.join(" ")}) ${extra} :targetList (${columns.join(" ")})})`;

/** A query function answering the catalog queries of `ViewNullability` for `views` (relid → ev_action). */
const catalog =
	(views: Readonly<Record<string, string>>): QueryFn =>
	async (text, values) => {
		const relid = String(values?.[0]);
		if (text.includes("FROM pg_rewrite")) {
			const ev = views[relid];
			return {
				rows: ev === undefined ? [] : [{ ev_action: ev, relname: `v${relid}` }],
			};
		}
		if (text.includes("FROM pg_attribute"))
			return {
				rows:
					relid === "10" ? [{ attnum: 1, notnull: true, relkind: "r" }] : [],
			};
		throw new Error(`unexpected query: ${text}`);
	};

const notNull = (ev: string) =>
	new ViewNullability(catalog({ 1: ev })).notNull(1);

describe("ViewNullability", () => {
	test("a NOT NULL column no outer join nulls is NOT NULL", async () => {
		expect(await notNull(query([column(variable(1, 1))], [TABLE]))).toEqual([
			true,
		]);
	});

	test("without varnullingrels (PostgreSQL 15 and older) a column reference is nullable", async () => {
		expect(
			await notNull(
				query(
					[
						"{TARGETENTRY :expr {VAR :varno 1 :varattno 1 :varlevelsup 0} :resname c}",
					],
					[TABLE],
				),
			),
		).toEqual([false]);
	});

	test("GROUPING SETS make the grouped columns nullable (PostgreSQL 16 and 17 do not mark them)", async () => {
		expect(
			await notNull(
				query(
					[column(variable(1, 1))],
					[TABLE],
					":groupingSets ({GROUPINGSET})",
				),
			),
		).toEqual([false]);
	});

	test("references the analysis cannot resolve are nullable", async () => {
		expect(
			await notNull(
				query(
					[
						column(variable(9, 1), "no_rte"),
						column(variable(1, 2), "no_column"),
						column(variable(2, 1), "no_subquery"),
						column(variable(3, 1), "past_the_targets"),
						column("<>", "no_expr"),
					],
					[
						TABLE,
						"{RANGETBLENTRY :rtekind 1}",
						"{RANGETBLENTRY :rtekind 1 :subquery {QUERY :targetList ()}}",
					],
				),
			),
		).toEqual([false, false, false, false, false]);
	});

	test("a subquery column is as NOT NULL as its expression", async () => {
		expect(
			await notNull(
				query(
					[column(variable(1, 1), "one"), column(variable(1, 2), "null")],
					[
						`{RANGETBLENTRY :rtekind 1 :subquery {QUERY :targetList (${column(ONE)} ${column(NULL)})}}`,
					],
				),
			),
		).toEqual([true, false]);
	});

	test("a set operation's arm or a CASE branch the analysis cannot read is nullable", async () => {
		expect(
			await notNull(
				query(
					[
						column(variable(1, 1), "arm"),
						column(`{CASEEXPR :args (<>) :defresult ${ONE}}`, "branch"),
					],
					[
						"{RANGETBLENTRY :rtekind 1 :subquery {QUERY :setOperations {SETOPERATIONSTMT} :rtable (<>)}}",
					],
				),
			),
		).toEqual([false, false]);
	});

	test("a join alias variable is as NOT NULL as the expression it stands for", async () => {
		expect(
			await notNull(
				query(
					[column(variable(1, 1), "null"), column(variable(1, 2), "one")],
					[`{RANGETBLENTRY :rtekind 2 :joinaliasvars (${NULL} ${ONE})}`],
				),
			),
		).toEqual([false, true]);
	});

	test("notNull: no _RETURN rule or no query gives no columns; the hook gets the view and column name", async () => {
		const seen: string[] = [];
		const views = new ViewNullability(
			catalog({
				1: "()",
				2: query(["{TARGETENTRY :expr <>}", column("<>", "c")]),
			}),
			{
				notNull: (view, name) => {
					seen.push(`${view}.${name}`);
					return name === "";
				},
			},
		);
		expect(await views.notNull(1)).toEqual([]);
		expect(await views.notNull(3)).toEqual([]);
		expect(await views.notNull("2")).toEqual([true, false]);
		expect(seen).toEqual(["v2.", "v2.c"]);
	});
});

describe("parseNodeTree", () => {
	test("an array field (`WRITE_INT_ARRAY`) keeps its first element", () => {
		expect(parseNodeTree("{X :a 1 2 3 :b 4}")).toEqual({
			_: "X",
			a: "1",
			b: "4",
		});
	});

	test("a label without a value is null", () => {
		expect(parseNodeTree("{X :a :b 1 :c}")).toEqual({
			_: "X",
			a: null,
			b: "1",
			c: null,
		});
	});
});
