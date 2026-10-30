import type { Dialect, DialectTypes, SqlOf } from "./dialect.js";
import { encodeInput, encodeParameters, type SqlPlugin } from "./plugin.js";
import type { Executor } from "./query.js";
import { makeFragment, makeQuery } from "./query.js";
import { build, namedValues } from "./runtime/build.js";
import { param, takeValue } from "./runtime/inline.js";
import { json } from "./runtime/json.js";
import type { Spliceable } from "./runtime/splice.js";
import {
	joinFragments,
	maxParam,
	quoteIdent,
	rewriteNamed,
	splice,
} from "./runtime/splice.js";
import { buildSet, buildValues } from "./runtime/write.js";
import type { SlotMap } from "./sql/slots.js";

export interface CreateSql {
	// biome-ignore lint/style/useShorthandFunctionType: Dialects merge signatures into this interface.
	<T extends DialectTypes, DB, TM = T["typeMap"]>(
		dialect: Dialect<T>,
		executor?: Executor,
	): SqlOf<T, DB, TM>;
}

export const createSql = createDialectSql as CreateSql;

export function createDialectSql<T extends DialectTypes, DB, TM = T["typeMap"]>(
	dialect: Dialect<T>,
	executor?: Executor,
	plugins: readonly SqlPlugin[] = [],
): SqlOf<T, DB, TM> {
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
		prepare: (query: string, slots: SlotMap = {}) => {
			const rn = rewriteNamed(query);
			const count = maxParam(rn.text);
			const initial = new Array<unknown>(count).fill(undefined);
			const base = build(rn.text, initial);
			const compiled = splice(base.text, slots, base.values);
			const fixed = compiled.values.slice(count);
			const prepared = executor?.prepare?.(compiled.text) ?? executor;
			return (...input: readonly unknown[]) => {
				const args =
					plugins.length === 0
						? input
						: encodeParameters(input, plugins, query);
				const values =
					rn.names.length > 0
						? namedValues(rn.names, args)
						: args.map(takeValue);
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
		as: (query: string, ...rest: readonly unknown[]) => {
			const { text, values } = buildInput(query, rest);
			return makeQuery(text, values, executor, pipeline);
		},
		param:
			plugins.length === 0
				? param
				: (value: unknown) =>
						param(encodeInput(value, plugins, { kind: "value" })),
		json,
		fragment: (text: string, ...rest: readonly unknown[]) => {
			const r = buildInput(text, rest);
			return makeFragment(r.text, r.values);
		},
		id: (...parts: readonly string[]) => makeFragment(quoteIdent(...parts), []),
		combine: (
			items: readonly Spliceable[],
			options?: { readonly separator?: string },
		) => {
			if (items.length === 0)
				throw new Error(
					"typesql: sql.combine() needs at least one item; put a fixed element first (`[base, ...rest]`) or skip the clause",
				);
			const r = joinFragments(items, options?.separator ?? ", ");
			return makeFragment(r.text, r.values);
		},
		set: (table: string, values: Readonly<Record<string, unknown>>) => {
			const r = buildSet(
				encodeInput(values, pipeline, { kind: "set", table }) as Readonly<
					Record<string, unknown>
				>,
			);
			return makeFragment(r.text, r.values);
		},
		values: (
			table: string,
			rows: readonly Readonly<Record<string, unknown>>[],
		) => {
			const encoded =
				pipeline.length === 0 || !Array.isArray(rows)
					? rows
					: rows.map(
							(row) =>
								encodeInput(row, pipeline, {
									kind: "values",
									table,
								}) as Readonly<Record<string, unknown>>,
						);
			const r = buildValues(encoded, dialect.valuesDefault !== false);
			return makeFragment(r.text, r.values);
		},
		raw: (text: string) => {
			const r = build(text, []);
			return makeFragment(r.text, r.values);
		},
	});
	return api as unknown as SqlOf<T, DB, TM>;
}
