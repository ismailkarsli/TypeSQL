import type { Dialect, DialectTypes, SqlOf } from "./dialect.js";
import { type Empty, empty } from "./empty.js";
import { encodeInput, type InputContext, type SqlPlugin } from "./plugin.js";
import { type Executor, SqlQuery } from "./query.js";
import {
	bind,
	type Compiled,
	compile,
	fail,
	ident,
	join,
	LEXIS,
	param,
	type Spliceable,
	SqlFragment,
} from "./runtime/compile.js";
import { json } from "./runtime/json.js";

export interface CreateSql {
	// biome-ignore lint/style/useShorthandFunctionType: Dialects merge signatures into this interface.
	<T extends DialectTypes, DB, TM = T["typeMap"]>(
		dialect: Dialect<T>,
		executor?: Executor,
	): SqlOf<T, DB, TM>;
}

/**
 * The `sql` of `dialect`. Its type is computed from the dialect's type
 * parameters, and dialects merge their own overloads into `CreateSql`: the
 * runtime API cannot be checked against them.
 */
// biome-ignore lint/nursery/noUnsafeTypeAssertion: see above.
export const createSql = createSqlApi as CreateSql;

const fragmentOf = (compiled: Compiled) =>
	new SqlFragment(compiled.text, compiled.values);

/** The `(table, input)` or `(input)` arguments of sql.set() and sql.values(). */
const tabled = (
	args: readonly unknown[],
): readonly [table: string | null, input: unknown] =>
	typeof args[0] === "string" ? [args[0], args[1]] : [null, args[0]];

/** The column values of an object that are not DEFAULT. */
const columns = <V>(value: V): [string, unknown][] => {
	const list = Object.entries(Object(value));
	const taken = bind(
		[],
		list.map((e) => e[1]),
		true,
	);
	return list
		.map(([key], i): [string, unknown] => [key, taken[i]])
		.filter((e) => e[1] !== undefined);
};

// sql.and / sql.or results are one condition already; nesting them adds no
// parentheses.
const GROUPED = new WeakSet<Spliceable>();

const present = (items: readonly (Spliceable | Empty)[]): Spliceable[] =>
	items.filter((item): item is Spliceable => item !== empty);

/** The runtime `sql` of `dialect`, whose type the dialect's `Sql` type describes. */
export function createSqlApi(
	dialect: Dialect,
	executor?: Executor,
	plugins: readonly SqlPlugin[] = [],
) {
	const {
		quote = `"`,
		emptyRow = "DEFAULT VALUES",
		valuesDefault,
		lexis = LEXIS,
	} = dialect;
	const bool = (given: readonly (Spliceable | Empty)[], op: "AND" | "OR") => {
		const items = present(given);
		const r = join(
			items.map((f) =>
				GROUPED.has(f) ? f : new SqlFragment(`(${f.text})`, f.values),
			),
			` ${op} `,
			lexis,
		);
		const fragment = new SqlFragment(
			items[1]
				? `(${r.text})`
				: items[0]
					? r.text
					: op === "AND"
						? "true"
						: "false",
			r.values,
		);
		GROUPED.add(fragment);
		return fragment;
	};
	const encode = <V>(value: V, context: InputContext) =>
		plugins[0] ? encodeInput(value, plugins, context) : value;
	const encodeArgs = (args: readonly unknown[], query: string) => {
		if (!plugins[0]) return args;
		const encoded = encodeInput(args, plugins, { kind: "parameters", query });
		return Array.isArray(encoded)
			? encoded
			: fail("a plugin must encode parameters as an array");
	};
	const call = (query: string, ...rest: readonly unknown[]) => {
		const { text, values } = compile(lexis, query, encodeArgs(rest, query));
		return new SqlQuery(text, values, executor, plugins);
	};
	const api = Object.assign(call, {
		// The `sql` types of the dialects give withPlugin its type.
		// biome-ignore lint/plugin: see above.
		withPlugin: (plugin: SqlPlugin): unknown =>
			createSqlApi(dialect, executor, [...plugins, plugin]),
		prepare: (query: string) => {
			const compiled = compile(lexis, query);
			const prepared = executor?.prepare?.(compiled.text) ?? executor;
			return (...input: readonly unknown[]) =>
				new SqlQuery(
					compiled.text,
					[
						...bind(compiled.names, encodeArgs(input, query)),
						...compiled.values,
					],
					prepared,
					plugins,
				);
		},
		as: call,
		param: <V>(value: V) =>
			param(value === empty ? value : encode(value, { kind: "value" })),
		optional: <V>(value: V) => (value === undefined ? empty : value),
		if: <V, R>(value: V, then: (value: V) => R) =>
			value ? then(value) : empty,
		json,
		fragment: (text: string, ...rest: readonly unknown[]) =>
			fragmentOf(compile(lexis, text, encodeArgs(rest, text))),
		id: (...parts: readonly string[]) =>
			new SqlFragment(ident(quote, parts), []),
		combine: (
			items: readonly (Spliceable | Empty)[],
			options?: { readonly separator?: string },
		) => {
			const defined = present(items);
			return defined[0]
				? join(defined, options?.separator ?? ", ", lexis)
				: fail("sql.combine() got no items");
		},
		and: (items: readonly (Spliceable | Empty)[]) => bool(items, "AND"),
		or: (items: readonly (Spliceable | Empty)[]) => bool(items, "OR"),
		set: (...args: readonly unknown[]) => {
			const [table, input] = tabled(args);
			const cols = columns(encode(input, { kind: "set", table }));
			if (!cols[0]) fail("sql.set() got no values; skip the UPDATE");
			return new SqlFragment(
				cols.map(([key], i) => `${ident(quote, [key])} = $${i + 1}`).join(", "),
				cols.map((e) => e[1]),
			);
		},
		values: (...args: readonly unknown[]) => {
			const [table, given] = tabled(args);
			const rows = [...Object(given)].map(
				(row) => new Map(columns(encode(row, { kind: "values", table }))),
			);
			if (!rows[0]) fail("sql.values() got no rows; skip the INSERT");
			const cols = Array.from(new Set(rows.flatMap((row) => [...row.keys()])));
			if (!cols[0]) {
				if (rows[1]) fail("sql.values() rows have no values");
				return new SqlFragment(emptyRow, []);
			}
			const values: unknown[] = [];
			const tuples = rows.map(
				(row) =>
					`(${cols
						.map((column) =>
							row.has(column)
								? `$${values.push(row.get(column))}`
								: valuesDefault === false
									? fail(
											`no DEFAULT in VALUES here; give every row "${column}"`,
										)
									: "DEFAULT",
						)
						.join(", ")})`,
			);
			return new SqlFragment(
				`(${cols.map((c) => ident(quote, [c])).join(", ")}) VALUES ${tuples.join(", ")}`,
				values,
			);
		},
		raw: (text: string) => fragmentOf(compile(lexis, text, [])),
	});
	return Object.defineProperty(api, "dialect", {
		value: dialect.name,
		enumerable: true,
	});
}
