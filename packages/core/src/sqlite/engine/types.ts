import type { Item } from "../../engine/family/types.js";

export type {
	AggMode,
	Cell,
	Col as SqCol,
	ColMap as SqColMap,
	ColOf as SqColOf,
	CteMap as SqCteMap,
	Ctx as SqCtx,
	MkCtx,
} from "../../engine/family/types.js";

/** A relation in scope; `rowid` names its rowid column, if it has one. */
export type SqItem = Item & { readonly rowid: string | null };
export type SqLevel = readonly SqItem[];

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
