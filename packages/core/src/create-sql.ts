import type { Executor } from "./query.js";
import { makeFragment, makeQuery } from "./query.js";
import type { RowKeys, SqlOptions } from "./row-keys.js";
import { build, namedValues } from "./runtime/build.js";
import { param, takeValue } from "./runtime/inline.js";
import { json } from "./runtime/json.js";
import type { Spliceable } from "./runtime/splice.js";
import {
	joinFragments,
	maxParam,
	quoteIdent,
	rewriteNamedOnce,
	splice,
} from "./runtime/splice.js";
import { buildSet, buildValues } from "./runtime/write.js";
import type { SlotMap } from "./sql/slots.js";
import type { Sql } from "./sql/types.js";
import type { DefaultTypeMap } from "./type-map/index.js";

export function createSql<DB, TM = DefaultTypeMap>(
	executor: Executor | undefined,
	options: SqlOptions & { readonly rowKeys: "camelCase" },
): Sql<DB, TM, "camelCase">;
export function createSql<DB, TM = DefaultTypeMap>(
	executor?: Executor,
	options?: SqlOptions & { readonly rowKeys?: "preserve" },
): Sql<DB, TM>;
export function createSql<DB, TM = DefaultTypeMap>(
	executor?: Executor,
	options?: SqlOptions,
): Sql<DB, TM, RowKeys> {
	const rowKeys = options?.rowKeys ?? "preserve";
	const call = (query: string, ...rest: readonly unknown[]) => {
		const { text, values } = build(query, rest);
		return makeQuery(text, values, executor, rowKeys);
	};
	const api = Object.assign(call, {
		prepare: (query: string, slots: SlotMap = {}) => {
			const rn = rewriteNamedOnce(query);
			const count = maxParam(rn.text);
			const initial = new Array<unknown>(count).fill(undefined);
			const base = build(rn.text, initial);
			const compiled = splice(base.text, slots, base.values);
			const fixed = compiled.values.slice(count);
			const prepared = executor?.prepare?.(compiled.text) ?? executor;
			return (...args: readonly unknown[]) => {
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
					rowKeys,
				);
			};
		},
		as: (query: string, ...rest: readonly unknown[]) => {
			const { text, values } = build(query, rest);
			return makeQuery(text, values, executor, rowKeys);
		},
		param,
		json,
		fragment: (text: string, ...rest: readonly unknown[]) => {
			const r = build(text, rest);
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
		set: (_table: string, values: Readonly<Record<string, unknown>>) => {
			const r = buildSet(values);
			return makeFragment(r.text, r.values);
		},
		values: (
			_table: string,
			rows: readonly Readonly<Record<string, unknown>>[],
		) => {
			const r = buildValues(rows);
			return makeFragment(r.text, r.values);
		},
		raw: (text: string) => {
			const r = build(text, []);
			return makeFragment(r.text, r.values);
		},
	});
	return api as unknown as Sql<DB, TM, RowKeys>;
}

export type { Sql } from "./sql/types.js";
