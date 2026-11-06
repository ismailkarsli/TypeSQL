import { applyPlugins, type SqlPlugin } from "./plugin.js";
import { fail, SqlFragment } from "./runtime/compile.js";

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

export class NoResultError extends Error {
	override readonly name = "NoResultError";
	declare readonly text: string;
	constructor(text: string) {
		super("The query returned no rows");
		this.text = text;
	}
}

/** A statement with its executor and plugins; its methods live on the prototype, so a query is `{ text, values }` to a spread. */
export class SqlQuery extends SqlFragment {
	readonly #executor: Executor | undefined;
	constructor(
		text: string,
		values: readonly unknown[],
		executor: Executor | undefined,
		plugins: readonly SqlPlugin[],
	) {
		super(text, values);
		this.#executor = executor;
		// Under PLUGINS, which `Symbol.for` shares across copies of this module, for pluginsOf().
		if (plugins[0]) Object.defineProperty(this, PLUGINS, { value: plugins });
	}
	#pick(executor = this.#executor): Executor {
		return (
			executor ?? fail("no executor; pass one to createSql() or execute()")
		);
	}
	async execute(executor?: Executor): Promise<unknown[]> {
		const result = await this.#pick(executor)(this.text, this.values);
		return mapRows(this, "rows" in result ? result.rows : result);
	}
	async executeTakeFirst(executor?: Executor) {
		return (await this.execute(executor))[0];
	}
	async executeTakeFirstOrThrow(executor?: Executor) {
		const rows = await this.execute(executor);
		if (!rows.length) throw new NoResultError(this.text);
		return rows[0];
	}
	async executeCount(executor?: Executor): Promise<number> {
		const exec = this.#pick(executor);
		if (exec.count) return exec.count(this.text, this.values);
		const result = await exec(this.text, this.values);
		return "rowCount" in result && result.rowCount !== undefined
			? (result.rowCount ?? 0)
			: fail("executor gave no rowCount");
	}
}

export const mapRows = <Q extends { readonly text: string }>(
	q: Q,
	rows: readonly unknown[],
): RowType<Q>[] =>
	// biome-ignore lint/nursery/noUnsafeTypeAssertion: row types are inferred from the SQL text, not from the driver's rows.
	applyPlugins(rows, pluginsOf(q)) as RowType<Q>[];

export const pluginsOf = (q: { readonly text: string }): readonly SqlPlugin[] =>
	// biome-ignore lint/nursery/noUnsafeTypeAssertion: only SqlQuery stores PLUGINS, with its plugin list.
	(PLUGINS in q && (q[PLUGINS] as readonly SqlPlugin[])) || [];
