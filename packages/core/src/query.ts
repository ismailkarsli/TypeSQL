import { applyPlugins, type SqlPlugin } from "./plugin.js";
import { inlineable } from "./runtime/inline.js";

export declare const ROW: unique symbol;
export declare const PARAMS: unique symbol;
export declare const TEXT: unique symbol;
export declare const CARRIED: unique symbol;

export interface ExecutorResult {
	readonly rows: readonly unknown[];
	readonly rowCount: number | null;
}

export type Executor = ((
	text: string,
	values: readonly unknown[],
) => PromiseLike<readonly unknown[] | ExecutorResult>) & {
	readonly prepare?: (text: string) => Executor;
	readonly count?: (
		text: string,
		values: readonly unknown[],
	) => PromiseLike<number>;
};

export class NoResultError extends Error {
	override readonly name = "NoResultError";
	readonly text: string;
	constructor(text: string) {
		super("The query returned no rows");
		this.text = text;
	}
}

/** The object part of a `Query`: what a query is besides its string brand. */
export interface QueryObject<
	Row,
	Params extends readonly unknown[],
	Text extends string,
> {
	readonly text: string;
	readonly values: readonly unknown[];
	readonly [ROW]?: Row;
	readonly [PARAMS]?: Params;
	readonly [TEXT]?: Text;
	execute(executor?: Executor): Promise<Row[]>;
	executeTakeFirst(executor?: Executor): Promise<Row | undefined>;
	executeTakeFirstOrThrow(executor?: Executor): Promise<Row>;
	executeCount(executor?: Executor): Promise<number>;
}

/** The object part of a `Fragment`: what a fragment is besides its string brand. */
export interface FragmentObject<
	Text extends string,
	Params extends readonly unknown[],
	Carried extends readonly unknown[],
> {
	readonly text: string;
	readonly values: readonly unknown[];
	readonly [TEXT]?: Text;
	readonly [PARAMS]?: Params;
	readonly [CARRIED]?: Carried;
}

/**
 * The string part types `${fragment}`, `${query}` and an omitted
 * `${sql.optional(…)}` in a template literal: TypeScript keeps their type as a
 * placeholder there, and `sql()` reads it back.
 */
export type InlineFragment = "\u0000typesql-fragment\u0000";

/** A statement; `${query}` splices it in place as a subquery. */
export type Query<
	Row,
	Params extends readonly unknown[] = readonly unknown[],
	Text extends string = string,
> = QueryObject<Row, Params, Text> & InlineFragment;

export type Fragment<
	Text extends string = string,
	Params extends readonly unknown[] = readonly unknown[],
	Carried extends readonly unknown[] = readonly unknown[],
> = FragmentObject<Text, Params, Carried> & InlineFragment;

export type RowType<Q> =
	Q extends Query<infer R, readonly unknown[], string> ? R : never;
export type ParamsType<Q> = Q extends { readonly [PARAMS]?: infer P }
	? P
	: never;
export type TextType<Q> = Q extends { readonly [TEXT]?: infer T extends string }
	? T
	: string;

const PLUGINS = Symbol.for("typesql.plugins");

export function mapRows<Q extends { readonly text: string }>(
	q: Q,
	rows: readonly unknown[],
): RowType<Q>[] {
	// biome-ignore lint/nursery/noUnsafeTypeAssertion: row types are inferred from the SQL text, not from the driver's rows.
	return applyPlugins(rows, pluginsOf(q)) as RowType<Q>[];
}

export function pluginsOf(q: { readonly text: string }): readonly SqlPlugin[] {
	if (!(PLUGINS in q)) return [];
	const plugins = q[PLUGINS];
	return isPluginList(plugins) ? plugins : [];
}

/** makeQuery() stores its plugins under PLUGINS, which `Symbol.for` shares across copies of this module. */
function isPluginList(value: unknown): value is readonly SqlPlugin[] {
	return (
		Array.isArray(value) &&
		value.every(
			(plugin) =>
				(typeof plugin === "object" && plugin !== null) ||
				typeof plugin === "function",
		)
	);
}

export function makeQuery<
	Row,
	Params extends readonly unknown[],
	Text extends string = string,
>(
	text: string,
	values: readonly unknown[],
	executor: Executor | undefined,
	plugins: readonly SqlPlugin[] = [],
): Query<Row, Params, Text> {
	const pick = (given?: Executor): Executor => {
		const exec = given ?? executor;
		if (!exec)
			throw new Error(
				"typesql: no executor: pass one to createSql(executor) or to execute(executor)",
			);
		return exec;
	};
	const execute = async (given?: Executor): Promise<unknown[]> => {
		const result = await pick(given)(text, values);
		return applyPlugins(isRows(result) ? result : result.rows, plugins);
	};
	const query = { text, values };
	if (plugins.length > 0)
		Object.defineProperty(query, PLUGINS, {
			value: plugins,
		});
	Object.defineProperty(query, "execute", { value: execute });
	Object.defineProperty(query, "executeCount", {
		value: async (given?: Executor) => {
			const exec = pick(given);
			if (exec.count) return exec.count(text, values);
			const result = await exec(text, values);
			if (isRows(result) || result.rowCount === undefined) {
				throw new Error(
					"typesql: the executor did not report a row count: resolve to { rows, rowCount } (the adapters' executor() do)",
				);
			}
			return result.rowCount ?? 0;
		},
	});
	Object.defineProperty(query, "executeTakeFirst", {
		value: async (given?: Executor) => (await execute(given))[0],
	});
	Object.defineProperty(query, "executeTakeFirstOrThrow", {
		value: async (given?: Executor) => {
			const rows = await execute(given);
			if (rows.length === 0) throw new NoResultError(text);
			return rows[0];
		},
	});
	inlineable(query);
	// biome-ignore lint/nursery/noUnsafeTypeAssertion: `Query` carries its row and parameter types as type-only brands.
	return query as Query<Row, Params, Text>;
}

function isRows(
	result: readonly unknown[] | ExecutorResult,
): result is readonly unknown[] {
	return Array.isArray(result);
}

export function makeFragment<
	Text extends string,
	Params extends readonly unknown[],
	Carried extends readonly unknown[] = readonly unknown[],
>(text: string, values: readonly unknown[]): Fragment<Text, Params, Carried> {
	// biome-ignore lint/nursery/noUnsafeTypeAssertion: `Fragment` carries its text and parameter types as type-only brands.
	return inlineable({ text, values }) as Fragment<Text, Params, Carried>;
}
