import { applyPlugins, type SqlPlugin } from "./plugin.js";
import { fail, SqlFragment } from "./runtime/compile.js";
import type { StatementFn, StatementParams } from "./sql/contract.js";

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
	exec(executor?: Executor): Promise<Row[]>;
	execTakeFirstOrNone(executor?: Executor): Promise<Row | undefined>;
	execTakeFirst(executor?: Executor): Promise<Row>;
	execCount(executor?: Executor): Promise<number>;
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

/** InlineFragment for an iterable statement, whose iterator a string's would clash with. */
export type InlineStatement = 0;

/** What `${statement}` reads of a statement. */
export interface StatementObject<Text extends string = string> {
	readonly text: string;
	readonly values: readonly unknown[];
	readonly [TEXT]?: Text;
}

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

export interface QueryStatement extends StatementFn {
	readonly out: Query<
		this["row"],
		StatementParams<this["params"]>,
		this["text"]
	>;
}

// Read off the row property: relating a statement to Query, whose string brand
// brings in String's members, costs the checker more.
export type RowType<Q> = Q extends { readonly [ROW]?: infer R } ? R : never;
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

/** What an adapter's own statement extends. */
export class SqlStatement extends SqlFragment {
	constructor(
		text: string,
		values: readonly unknown[],
		plugins: readonly SqlPlugin[],
	) {
		super(text, values);
		// Under PLUGINS, which `Symbol.for` shares across copies of this module, for pluginsOf().
		if (plugins[0]) Object.defineProperty(this, PLUGINS, { value: plugins });
	}
}

/** A statement with its executor and plugins; its methods live on the prototype, so a query is `{ text, values }` to a spread. */
export class SqlQuery extends SqlStatement {
	readonly #executor: Executor | undefined;
	constructor(
		text: string,
		values: readonly unknown[],
		executor: Executor | undefined,
		plugins: readonly SqlPlugin[],
	) {
		super(text, values, plugins);
		this.#executor = executor;
	}
	#pick(executor = this.#executor): Executor {
		return executor ?? fail("no executor; pass one to createSql() or exec()");
	}
	async exec(executor?: Executor): Promise<unknown[]> {
		const result = await this.#pick(executor)(this.text, this.values);
		return mapRows(this, "rows" in result ? result.rows : result);
	}
	async execTakeFirstOrNone(executor?: Executor) {
		return (await this.exec(executor))[0];
	}
	async execTakeFirst(executor?: Executor) {
		const rows = await this.exec(executor);
		if (!rows.length) throw new NoResultError(this.text);
		return rows[0];
	}
	async execCount(executor?: Executor): Promise<number> {
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
	// biome-ignore lint/nursery/noUnsafeTypeAssertion: only SqlStatement stores PLUGINS, with its plugin list.
	(PLUGINS in q && (q[PLUGINS] as readonly SqlPlugin[])) || [];
