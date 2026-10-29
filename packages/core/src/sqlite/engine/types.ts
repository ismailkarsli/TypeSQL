import type { ColInfo, Scope } from "../../engine/types.js";

export type SqCol = ColInfo & { readonly n: string };
export type SqColMap = { readonly [lc: string]: SqCol };

export type SqItem = {
	readonly alias: string | null;
	readonly cols: SqColMap;
	readonly skip: readonly string[];
	readonly order: readonly string[];
	readonly rowid: string | null;
};
export type SqLevel = readonly SqItem[];

export type SqCteMap = {
	readonly [lc: string]: {
		readonly cols: SqColMap;
		readonly order: readonly string[];
	};
};

export type AggMode = "none" | "group" | "whole";

export type SqCtx = {
	readonly db: unknown;
	readonly scope: Scope;
	readonly ctes: SqCteMap;
	readonly agg: AggMode;
	readonly inAgg: boolean;
	readonly aliases: SqColMap;
};

export type MkCtx<
	DB,
	S extends Scope,
	Ctes extends SqCteMap,
	Agg extends AggMode = "none",
	Aliases extends SqColMap = {},
> = {
	readonly db: DB;
	readonly scope: S;
	readonly ctes: Ctes;
	readonly agg: Agg;
	readonly inAgg: false;
	readonly aliases: Aliases;
};

export type Affinity<T extends string> = T extends "null" | "unknown" | "any"
	? T
	: T extends `${string}int${string}`
		? "integer"
		: T extends `${string}${"char" | "clob" | "text"}${string}`
			? "text"
			: T extends `${string}blob${string}`
				? "blob"
				: T extends `${string}${"real" | "floa" | "doub"}${string}`
					? "real"
					: T extends ""
						? "any"
						: "numeric";

export type NumClass<T extends string> =
	Affinity<T> extends infer A
		? A extends "integer"
			? "integer"
			: A extends "real"
				? "real"
				: A extends "null"
					? "null"
					: "numeric"
		: never;

export type NormalizeType<T extends string> = T extends ""
	? "any"
	: Lowercase<T>;

export type Cell = {
	readonly n: string;
	readonly t: ColInfo;
	readonly d?: string;
};
