import type {
	AliasAt,
	IdentAt,
	IdentList as IdentListOf,
	OptCols as OptColsOf,
	TableRefAt as TableRefAtOf,
} from "../../../engine/family/parse.js";
import type { Toks } from "../../../engine/tokens.js";
import type { NotBareAlias, NotTableAlias, Reserved } from "./keywords.js";

/** How the server words a syntax error. */
export type SyntaxWords = {
	readonly near: ["You have an error in your SQL syntax near '", "'"];
	readonly end: "You have an error in your SQL syntax near the end of the statement";
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
