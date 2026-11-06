/** Behaviour a declared function can state besides its signature. */
export type SigFlags = {
	readonly strict?: boolean | readonly number[];
	readonly nullable?: boolean;
	readonly agg?: boolean;
	readonly window?: boolean;
	readonly srf?: boolean;
};

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
