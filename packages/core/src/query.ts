import { applyPlugins, type SqlPlugin } from "./plugin.js";

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

export interface Query<
	Row,
	Params extends readonly unknown[] = readonly unknown[],
	Text extends string = string,
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

export interface Fragment<
	Text extends string = string,
	Params extends readonly unknown[] = readonly unknown[],
	Carried extends readonly unknown[] = readonly unknown[],
> {
	readonly text: string;
	readonly values: readonly unknown[];
	readonly [TEXT]?: Text;
	readonly [PARAMS]?: Params;
	readonly [CARRIED]?: Carried;
}

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
	return applyPlugins(rows, pluginsOf(q)) as RowType<Q>[];
}

export function pluginsOf(q: { readonly text: string }): readonly SqlPlugin[] {
	return (q as { readonly [PLUGINS]?: readonly SqlPlugin[] })[PLUGINS] ?? [];
}

const SLOTTABLES = new WeakSet<object>();

export function isSlottable(v: unknown): boolean {
	return typeof v === "object" && v !== null && SLOTTABLES.has(v);
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
	SLOTTABLES.add(query);
	return query as unknown as Query<Row, Params, Text>;
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
	const fragment = { text, values };
	SLOTTABLES.add(fragment);
	return fragment;
}
