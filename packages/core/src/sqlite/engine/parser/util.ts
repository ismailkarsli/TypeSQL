import type {
	AliasAt,
	IdentAt,
	IdentList as IdentListOf,
	IsWord,
	Name,
	OptCols as OptColsOf,
	SyntaxErr,
	TableRefAt as TableRefAtOf,
} from "../../../engine/family/parse.js";
import type { Next } from "../../../engine/next.js";
import type { Toks } from "../../../engine/tokens.js";
import type { NotBareAlias, NotTableAlias, Reserved } from "./keywords.js";

/** How the server words a syntax error. */
export type SyntaxWords = {
	readonly near: ['near "', '": syntax error'];
	readonly end: "incomplete input";
};

export type Ident<T extends Toks, I extends number> = IdentAt<T, I, Reserved>;

export type BareAlias<T extends Toks, I extends number> = AliasAt<
	T,
	I,
	NotBareAlias
>;
export type TableAlias<T extends Toks, I extends number> = AliasAt<
	T,
	I,
	NotTableAlias
>;

export type IdentList<T extends Toks, I extends number> = IdentListOf<
	T,
	I,
	Reserved
>;

export type OptCols<T extends Toks, I extends number> = OptColsOf<
	T,
	I,
	Reserved
>;

export type TableRefAt<T extends Toks, I extends number> = TableRefAtOf<
	T,
	I,
	Reserved
>;

export type SkipIndexed<T extends Toks, I extends number> =
	IsWord<T, I, "indexed"> extends true
		? IsWord<T, Next<I>, "by"> extends true
			? Ident<T, Next<Next<I>>> extends Name
				? Next<Next<Next<I>>>
				: SyntaxErr<T, Next<Next<I>>>
			: SyntaxErr<T, Next<I>>
		: IsWord<T, I, "not"> extends true
			? IsWord<T, Next<I>, "indexed"> extends true
				? Next<Next<I>>
				: SyntaxErr<T, Next<I>>
			: I;
