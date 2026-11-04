import type { Dialect, DialectTypes, SqlOf } from "./dialect.js";
import { type Empty, empty, isEmpty, optional } from "./empty.js";
import { encodeInput, encodeParameters, type SqlPlugin } from "./plugin.js";
import type { Executor } from "./query.js";
import { makeFragment, makeQuery } from "./query.js";
import { build, namedValues } from "./runtime/build.js";
import { param, takeValues } from "./runtime/inline.js";
import { json } from "./runtime/json.js";
import type { Spliceable } from "./runtime/splice.js";
import {
	joinFragments,
	maxParam,
	quoteIdent,
	rewriteNamed,
} from "./runtime/splice.js";
import { buildSet, buildValues, columnEntries } from "./runtime/write.js";

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

/** The runtime `sql` of `dialect`, whose type the dialect's `Sql` type describes. */
export function createSqlApi(
	dialect: Dialect,
	executor: Executor | undefined,
	plugins: readonly SqlPlugin[],
) {
	const pipeline = Object.freeze([...plugins]);
	const buildInput =
		plugins.length === 0
			? build
			: (query: string, rest: readonly unknown[]) =>
					build(query, rest, (args) => encodeParameters(args, plugins, query));
	const call = (query: string, ...rest: readonly unknown[]) => {
		const { text, values } = buildInput(query, rest);
		return makeQuery(text, values, executor, pipeline);
	};
	const api = Object.assign(call, {
		withPlugin: (plugin: SqlPlugin) =>
			createDialectSql(dialect, executor, [...plugins, plugin]),
		prepare: (query: string) => {
			const rn = rewriteNamed(query);
			const count = maxParam(rn.text);
			const initial = new Array<unknown>(count).fill(undefined);
			const compiled = build(rn.text, initial);
			const fixed = compiled.values.slice(count);
			const prepared = executor?.prepare?.(compiled.text) ?? executor;
			return (...input: readonly unknown[]) => {
				const args =
					plugins.length === 0
						? input
						: encodeParameters(input, plugins, query);
				const values =
					rn.names.length > 0 ? namedValues(rn.names, args) : takeValues(args);
				if (values.length !== count)
					throw new Error(
						`typesql: prepared query expects ${count} parameters, got ${values.length}`,
					);
				return makeQuery(
					compiled.text,
					[...values, ...fixed],
					prepared,
					pipeline,
				);
			};
		},
		as: call,
		param:
			plugins.length === 0
				? param
				: <V>(value: V) =>
						param(
							isEmpty(value)
								? value
								: encodeInput(value, plugins, { kind: "value" }),
						),
		optional,
		if: <V, R>(value: V, then: (value: V) => R) =>
			value ? then(value) : empty,
		json,
		fragment: (text: string, ...rest: readonly unknown[]) => {
			const r = buildInput(text, rest);
			return makeFragment(r.text, r.values);
		},
		id: (...parts: readonly string[]) => {
			if (parts.some((p) => typeof p !== "string"))
				throw new Error("typesql: sql.id() takes names as strings");
			return makeFragment(quoteIdent(...parts), []);
		},
		combine: (
			items: readonly (Spliceable | Empty)[],
			options?: { readonly separator?: string },
		) => {
			const defined = present(items, "combine");
			if (defined.length === 0)
				throw new Error(
					"typesql: sql.combine() needs at least one item; put a fixed element first (`[base, ...rest]`) or skip the clause",
				);
			const r = joinFragments(defined, options?.separator ?? ", ");
			return makeFragment(r.text, r.values);
		},
		and: (items: readonly (Spliceable | Empty)[]) =>
			bool(present(items, "and"), "AND"),
		or: (items: readonly (Spliceable | Empty)[]) =>
			bool(present(items, "or"), "OR"),
		set: (...args: readonly unknown[]) => {
			const [first, second] = args;
			const table = typeof first === "string" ? first : null;
			const values = typeof first === "string" ? second : first;
			const r = buildSet(
				columnEntries(
					encodeInput(values, pipeline, { kind: "set", table }),
					"typesql: sql.set() takes an object of column values",
				),
			);
			return makeFragment(r.text, r.values);
		},
		values: (...args: readonly unknown[]) => {
			const [first, second] = args;
			const table = typeof first === "string" ? first : null;
			const rows = typeof first === "string" ? second : first;
			if (!Array.isArray(rows))
				throw new Error("typesql: sql.values() takes an array of rows");
			const context = { kind: "values", table } as const;
			const encoded =
				pipeline.length === 0
					? rows
					: rows.map((row) => encodeInput(row, pipeline, context));
			const r = buildValues(encoded, dialect.valuesDefault !== false);
			return makeFragment(r.text, r.values);
		},
		raw: (text: string) => {
			const r = build(text, []);
			return makeFragment(r.text, r.values);
		},
	});
	Object.defineProperty(api, "dialect", {
		value: dialect.name,
		enumerable: true,
	});
	return api;
}

function present(
	items: readonly (Spliceable | Empty)[],
	name: string,
): Spliceable[] {
	const defined: Spliceable[] = [];
	for (const item of items) {
		if (isEmpty(item)) continue;
		if (item === null || item === undefined)
			throw new Error(
				`typesql: sql.${name}() does not accept null or undefined; wrap an optional item in sql.optional(), which omits it when it is undefined`,
			);
		defined.push(item);
	}
	return defined;
}

// sql.and / sql.or results are one condition already; nesting them adds no
// parentheses.
const GROUPED = new WeakSet<Spliceable>();

function bool(items: readonly Spliceable[], op: "AND" | "OR") {
	const r = joinFragments(
		items.map((f) =>
			GROUPED.has(f) ? f : { text: `(${f.text})`, values: f.values },
		),
		` ${op} `,
	);
	const text =
		items.length === 0
			? op === "AND"
				? "true"
				: "false"
			: items.length === 1
				? r.text
				: `(${r.text})`;
	const fragment = makeFragment(text, r.values);
	GROUPED.add(fragment);
	return fragment;
}
