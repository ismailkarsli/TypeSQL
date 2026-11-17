import type { ColInfo } from "../../engine/types.js";

/** Behaviour a declared function can state besides its signature. */
export type SigFlags = {
	readonly strict?: boolean | readonly number[];
	readonly nullable?: boolean;
	readonly agg?: boolean;
	readonly window?: boolean;
	readonly srf?: boolean;
	/**
	 * The columns of a function that returns rows of no table (`RETURNS TABLE
	 * (...)`, OUT parameters), as it reads in FROM: a type name, which is
	 * nullable, or a `Col`.
	 */
	readonly columns?: FunctionColumns;
};

/** The columns a function returns: a type name (nullable) or a `Col`, by name. */
export type FunctionColumns = { readonly [name: string]: string | ColInfo };

export type Sig<
	Args extends readonly string[],
	Ret extends string,
	Flags extends SigFlags = {},
> = {
	readonly args: Args;
	readonly ret: Ret;
} & Flags;

/** Any signature a schema can declare. */
export type DeclaredSig = {
	readonly args: readonly string[];
	readonly ret: string;
} & SigFlags;

/** The functions a schema declares under `$functions`: a signature or overloads. */
export type FunctionRegistry = {
	readonly [name: string]: DeclaredSig | readonly DeclaredSig[];
};
