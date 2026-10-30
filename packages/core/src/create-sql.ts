import type { Dialect, DialectTypes, SqlOf } from "./dialect.js";
import { type Empty, empty, isEmpty } from "./empty.js";
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
	rewriteNamed,
	splice,
} from "./runtime/splice.js";
import { buildSet, buildValues } from "./runtime/write.js";
import type { SlotMap } from "./sql/slots.js";

export interface CreateSql {
	<T extends DialectTypes, DB, TM = T["typeMap"]>(
		dialect: Dialect<T>,
		executor: Executor | undefined,
		options: SqlOptions & { readonly rowKeys: "camelCase" },
	): SqlOf<T, DB, TM, "camelCase">;
	<T extends DialectTypes, DB, TM = T["typeMap"]>(
		dialect: Dialect<T>,
		executor?: Executor,
		options?: SqlOptions & { readonly rowKeys?: "preserve" },
	): SqlOf<T, DB, TM>;
}

export const createSql = createDialectSql as CreateSql;

export function createDialectSql<T extends DialectTypes, DB, TM = T["typeMap"]>(
	dialect: Dialect<T>,
	executor?: Executor,
	options?: SqlOptions,
): SqlOf<T, DB, TM, RowKeys> {
	const rowKeys = options?.rowKeys ?? "preserve";
	const call = (query: string, ...rest: readonly unknown[]) => {
		const { text, values } = build(query, rest);
		return makeQuery(text, values, executor, rowKeys);
	};
	const api = Object.assign(call, {
		prepare: (query: string, slots: SlotMap = {}) => {
			const rn = rewriteNamed(query);
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
		empty,
		json,
		fragment: (text: string, ...rest: readonly unknown[]) => {
			const r = build(text, rest);
			return makeFragment(r.text, r.values);
		},
		id: (...parts: readonly string[]) => makeFragment(quoteIdent(...parts), []),
		combine: (
			items: readonly (Spliceable | Empty)[],
			options?: { readonly separator?: string },
		) => {
			const defined: Spliceable[] = [];
			for (const item of items) {
				if (isEmpty(item)) continue;
				if (item === null || item === undefined)
					throw new Error(
						"typesql: sql.combine() does not accept null or undefined; use sql.empty or sql.empty(value) to omit an item",
					);
				defined.push(item);
			}
			if (defined.length === 0)
				throw new Error(
					"typesql: sql.combine() needs at least one item; put a fixed element first (`[base, ...rest]`) or skip the clause",
				);
			const r = joinFragments(defined, options?.separator ?? ", ");
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
			const r = buildValues(rows, dialect.valuesDefault !== false);
			return makeFragment(r.text, r.values);
		},
		raw: (text: string) => {
			const r = build(text, []);
			return makeFragment(r.text, r.values);
		},
	});
	return api as unknown as SqlOf<T, DB, TM, RowKeys>;
}
