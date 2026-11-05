import type { Dialect, DialectTypes, SqlOf } from "./dialect.js";
import { type Empty, empty, isEmpty, optional } from "./empty.js";
import { encodeInput, encodeParameters, type SqlPlugin } from "./plugin.js";
import type { Executor } from "./query.js";
import { makeFragment, makeQuery } from "./query.js";
import {
	bind,
	type CompiledSql,
	compile,
	ident,
	join,
	param,
	type Spliceable,
} from "./runtime/compile.js";
import { json } from "./runtime/json.js";
import { buildSet, buildValues } from "./runtime/write.js";

export interface CreateSql {
	// biome-ignore lint/style/useShorthandFunctionType: Dialects merge signatures into this interface.
	<T extends DialectTypes, DB, TM = T["typeMap"]>(
		dialect: Dialect<T>,
		executor?: Executor,
	): SqlOf<T, DB, TM>;
}

// biome-ignore lint/nursery/noUnsafeTypeAssertion: dialects merge their own overloads into `CreateSql`.
export const createSql = createDialectSql as CreateSql;

export function createDialectSql<T extends DialectTypes, DB, TM = T["typeMap"]>(
	dialect: Dialect<T>,
	executor?: Executor,
	plugins: readonly SqlPlugin[] = [],
): SqlOf<T, DB, TM> {
	// The dialect's `sql` type is computed from its type parameters; the
	// runtime API cannot be checked against it.
	// biome-ignore lint/nursery/noUnsafeTypeAssertion: see above.
	return createSqlApi(dialect, executor, plugins) as SqlOf<T, DB, TM>;
}

const fragmentOf = (compiled: CompiledSql) =>
	makeFragment(compiled.text, compiled.values);

/** The runtime `sql` of `dialect`, whose type the dialect's `Sql` type describes. */
export function createSqlApi(
	dialect: Dialect,
	executor: Executor | undefined,
	plugins: readonly SqlPlugin[],
) {
	const quote = dialect.quote ?? '"';
	const encode = (args: readonly unknown[], query: string) =>
		plugins.length === 0 ? args : encodeParameters(args, plugins, query);
	const call = (query: string, ...rest: readonly unknown[]) => {
		const { text, values } = compile(query, encode(rest, query));
		return makeQuery(text, values, executor, plugins);
	};
	const fragment = (text: string, ...rest: readonly unknown[]) =>
		fragmentOf(compile(text, encode(rest, text)));
	const api = Object.assign(call, {
		withPlugin: (plugin: SqlPlugin) =>
			createDialectSql(dialect, executor, [...plugins, plugin]),
		prepare: (query: string) => {
			const compiled = compile(query);
			const prepared = executor?.prepare?.(compiled.text) ?? executor;
			return (...input: readonly unknown[]) => {
				const values = bind(compiled.names, encode(input, query));
				if (values.length !== compiled.count)
					throw new Error(
						`typesql: expected ${compiled.count} parameters, got ${values.length}`,
					);
				return makeQuery(
					compiled.text,
					[...values, ...compiled.values],
					prepared,
					plugins,
				);
			};
		},
		as: call,
		param: <V>(value: V) =>
			param(
				plugins.length === 0 || isEmpty(value)
					? value
					: encodeInput(value, plugins, { kind: "value" }),
			),
		optional,
		if: <V, R>(value: V, then: (value: V) => R) =>
			value ? then(value) : empty,
		json,
		fragment,
		id: (...parts: readonly string[]) => {
			if (parts.some((p) => typeof p !== "string"))
				throw new Error("typesql: sql.id() takes strings");
			return makeFragment(ident(quote, parts), []);
		},
		combine: (
			items: readonly (Spliceable | Empty)[],
			options?: { readonly separator?: string },
		) => {
			const defined = present(items, "combine");
			if (defined.length === 0)
				throw new Error("typesql: sql.combine() got no items");
			return fragmentOf(join(defined, options?.separator ?? ", "));
		},
		and: (items: readonly (Spliceable | Empty)[]) => bool(items, "AND"),
		or: (items: readonly (Spliceable | Empty)[]) => bool(items, "OR"),
		set: (...args: readonly unknown[]) => {
			const [table, input] = tabled(args);
			return fragmentOf(
				buildSet(encodeInput(input, plugins, { kind: "set", table }), quote),
			);
		},
		values: (...args: readonly unknown[]) => {
			const [table, rows] = tabled(args);
			if (!Array.isArray(rows))
				throw new Error("typesql: sql.values() takes an array");
			const context = { kind: "values", table } as const;
			return fragmentOf(
				buildValues(
					plugins.length === 0
						? rows
						: rows.map((row) => encodeInput(row, plugins, context)),
					dialect,
					quote,
				),
			);
		},
		raw: (text: string) => fragmentOf(compile(text, [])),
	});
	Object.defineProperty(api, "dialect", {
		value: dialect.name,
		enumerable: true,
	});
	return api;
}

/** The `(table, input)` or `(input)` arguments of sql.set() and sql.values(). */
const tabled = (
	args: readonly unknown[],
): readonly [table: string | null, input: unknown] =>
	typeof args[0] === "string" ? [args[0], args[1]] : [null, args[0]];

function present(
	items: readonly (Spliceable | Empty)[],
	name: string,
): Spliceable[] {
	const defined: Spliceable[] = [];
	for (const item of items) {
		if (isEmpty(item)) continue;
		if (item === null || item === undefined)
			throw new Error(
				`typesql: sql.${name}() got null or undefined; use sql.optional()`,
			);
		defined.push(item);
	}
	return defined;
}

// sql.and / sql.or results are one condition already; nesting them adds no
// parentheses.
const GROUPED = new WeakSet<Spliceable>();

function bool(given: readonly (Spliceable | Empty)[], op: "AND" | "OR") {
	const items = present(given, op.toLowerCase());
	const r = join(
		items.map((f) =>
			GROUPED.has(f) ? f : { text: `(${f.text})`, values: f.values },
		),
		` ${op} `,
	);
	const fragment = makeFragment(
		items.length === 0
			? op === "AND"
				? "true"
				: "false"
			: items.length === 1
				? r.text
				: `(${r.text})`,
		r.values,
	);
	GROUPED.add(fragment);
	return fragment;
}
