import type {
	DeclaredFn,
	Many,
	MaxArgs,
	MinArgs,
	PickSig,
} from "../../../engine/family/functions.js";
import type { Info } from "../../../engine/types.js";

type F<
	Min extends number,
	Max extends number,
	Ret extends string,
	Null extends NullRule,
	Kind extends "scalar" | "agg" | "win" = "scalar",
	Args = readonly Info<"unknown", true>[],
> = {
	readonly min: Min;
	readonly max: Max;
	readonly ret: Ret;
	readonly null: Null;
	readonly kind: Kind;
	readonly args: Args;
};

/**
 * The type a parameter takes in each argument position, as in `upper($1)`;
 * `unknown` without a rule. `same`: the first typed argument's type, for all;
 * `if`: a condition, then the type both results share.
 */
type Text = readonly Info<"text", true>[];
type Num = readonly Info<"numeric", true>[];
type JsonArgs = [Info<"json", true>, ...Info<"text", true>[]];
type Same = "same";
type IfArgs = "if";
type Substr = [
	Info<"text", true>,
	Info<"integer", true>,
	Info<"integer", true>,
];
type Offset = [
	Info<"unknown", true>,
	Info<"integer", false>,
	Info<"unknown", true>,
];

type NullRule =
	| "never"
	| "args"
	| "arg0"
	| "always"
	| "all"
	| "iif"
	| "sign"
	| "numargs"
	| "format"
	| "noargs"
	| "substr"
	| "agg";

export interface Functions {
	abs: F<1, 1, "abs", "args", "scalar", Num>;
	// FTS5 auxiliary functions; the first argument is the FTS5 table.
	bm25: F<1, Many, "real", "never">;
	highlight: F<4, 4, "text", "always">;
	snippet: F<6, 6, "text", "always">;
	unistr: F<1, 1, "text", "args">;
	changes: F<0, 0, "integer", "never">;
	char: F<0, Many, "text", "never">;
	coalesce: F<2, Many, "common", "all", "scalar", Same>;
	concat: F<1, Many, "text", "never", "scalar", Text>;
	concat_ws: F<2, Many, "text", "arg0", "scalar", Text>;
	format: F<1, Many, "text", "format", "scalar", Text>;
	printf: F<1, Many, "text", "format", "scalar", Text>;
	glob: F<2, 2, "integer", "args", "scalar", Text>;
	hex: F<1, 1, "text", "never">;
	ifnull: F<2, 2, "common", "all", "scalar", Same>;
	iif: F<2, Many, "iif", "iif", "scalar", IfArgs>;
	if: F<2, Many, "iif", "iif", "scalar", IfArgs>;
	instr: F<2, 2, "integer", "args", "scalar", Text>;
	last_insert_rowid: F<0, 0, "integer", "never">;
	length: F<1, 1, "integer", "args">;
	like: F<2, 3, "integer", "args", "scalar", Text>;
	likelihood: F<2, 2, "arg0", "arg0">;
	likely: F<1, 1, "arg0", "arg0">;
	lower: F<1, 1, "text", "args", "scalar", Text>;
	ltrim: F<1, 2, "text", "args", "scalar", Text>;
	max: F<1, Many, "common", "args", "scalar", Same>;
	min: F<1, Many, "common", "args", "scalar", Same>;
	nullif: F<2, 2, "arg0", "always", "scalar", Same>;
	octet_length: F<1, 1, "integer", "args">;
	quote: F<1, 1, "text", "never">;
	random: F<0, 0, "integer", "never">;
	randomblob: F<1, 1, "blob", "never", "scalar", Num>;
	replace: F<3, 3, "text", "args", "scalar", Text>;
	round: F<1, 2, "real", "args", "scalar", Num>;
	rtrim: F<1, 2, "text", "args", "scalar", Text>;
	sign: F<1, 1, "integer", "sign", "scalar", Num>;
	sqlite_compileoption_get: F<1, 1, "text", "always">;
	sqlite_compileoption_used: F<1, 1, "integer", "args">;
	sqlite_source_id: F<0, 0, "text", "never">;
	sqlite_version: F<0, 0, "text", "never">;
	substr: F<2, 3, "substr", "substr", "scalar", Substr>;
	substring: F<2, 3, "substr", "substr", "scalar", Substr>;
	total_changes: F<0, 0, "integer", "never">;
	trim: F<1, 2, "text", "args", "scalar", Text>;
	typeof: F<1, 1, "text", "never">;
	unhex: F<1, 2, "blob", "always", "scalar", Text>;
	unicode: F<1, 1, "integer", "always", "scalar", Text>;
	unlikely: F<1, 1, "arg0", "arg0">;
	upper: F<1, 1, "text", "args", "scalar", Text>;
	zeroblob: F<1, 1, "blob", "never", "scalar", Num>;

	date: F<0, Many, "text", "noargs">;
	time: F<0, Many, "text", "noargs">;
	datetime: F<0, Many, "text", "noargs">;
	julianday: F<0, Many, "real", "noargs">;
	unixepoch: F<0, Many, "integer", "noargs">;
	strftime: F<1, Many, "text", "always">;
	timediff: F<2, 2, "text", "always">;

	acos: F<1, 1, "real", "always", "scalar", Num>;
	acosh: F<1, 1, "real", "always", "scalar", Num>;
	asin: F<1, 1, "real", "always", "scalar", Num>;
	asinh: F<1, 1, "real", "numargs", "scalar", Num>;
	atan: F<1, 1, "real", "numargs", "scalar", Num>;
	atan2: F<2, 2, "real", "numargs", "scalar", Num>;
	atanh: F<1, 1, "real", "always", "scalar", Num>;
	ceil: F<1, 1, "ceil", "sign", "scalar", Num>;
	ceiling: F<1, 1, "ceil", "sign", "scalar", Num>;
	cos: F<1, 1, "real", "numargs", "scalar", Num>;
	cosh: F<1, 1, "real", "numargs", "scalar", Num>;
	degrees: F<1, 1, "real", "numargs", "scalar", Num>;
	exp: F<1, 1, "real", "numargs", "scalar", Num>;
	floor: F<1, 1, "ceil", "sign", "scalar", Num>;
	ln: F<1, 1, "real", "always", "scalar", Num>;
	log: F<1, 2, "real", "always", "scalar", Num>;
	log10: F<1, 1, "real", "always", "scalar", Num>;
	log2: F<1, 1, "real", "always", "scalar", Num>;
	mod: F<2, 2, "real", "always", "scalar", Num>;
	pi: F<0, 0, "real", "never">;
	pow: F<2, 2, "real", "always", "scalar", Num>;
	power: F<2, 2, "real", "always", "scalar", Num>;
	radians: F<1, 1, "real", "numargs", "scalar", Num>;
	sin: F<1, 1, "real", "numargs", "scalar", Num>;
	sinh: F<1, 1, "real", "numargs", "scalar", Num>;
	sqrt: F<1, 1, "real", "always", "scalar", Num>;
	tan: F<1, 1, "real", "numargs", "scalar", Num>;
	tanh: F<1, 1, "real", "numargs", "scalar", Num>;
	trunc: F<1, 1, "ceil", "sign", "scalar", Num>;

	json: F<1, 1, "text", "args", "scalar", JsonArgs>;
	jsonb: F<1, 1, "blob", "args", "scalar", JsonArgs>;
	json_array: F<0, Many, "text", "never">;
	jsonb_array: F<0, Many, "blob", "never">;
	json_array_length: F<1, 2, "integer", "always", "scalar", JsonArgs>;
	json_error_position: F<1, 1, "integer", "args">;
	json_extract: F<2, Many, "text", "always", "scalar", JsonArgs>;
	jsonb_extract: F<2, Many, "any", "always", "scalar", JsonArgs>;
	json_insert: F<1, Many, "text", "arg0">;
	json_array_insert: F<1, Many, "text", "arg0">;
	jsonb_insert: F<1, Many, "blob", "arg0">;
	json_object: F<0, Many, "text", "never">;
	jsonb_object: F<0, Many, "blob", "never">;
	json_patch: F<2, 2, "text", "args", "scalar", JsonArgs>;
	jsonb_patch: F<2, 2, "blob", "args", "scalar", JsonArgs>;
	json_pretty: F<1, 2, "text", "arg0", "scalar", JsonArgs>;
	json_quote: F<1, 1, "text", "never">;
	json_remove: F<1, Many, "text", "arg0", "scalar", JsonArgs>;
	jsonb_remove: F<1, Many, "blob", "arg0", "scalar", JsonArgs>;
	json_replace: F<1, Many, "text", "arg0">;
	jsonb_replace: F<1, Many, "blob", "arg0">;
	json_set: F<1, Many, "text", "arg0">;
	jsonb_set: F<1, Many, "blob", "arg0">;
	json_type: F<1, 2, "text", "always", "scalar", JsonArgs>;
	json_valid: F<1, 2, "integer", "arg0", "scalar", JsonArgs>;

	avg: F<1, 1, "real", "agg", "agg", Num>;
	median: F<1, 1, "real", "agg", "agg">;
	percentile: F<2, 2, "real", "agg", "agg">;
	percentile_cont: F<2, 2, "real", "agg", "agg">;
	percentile_disc: F<2, 2, "real", "agg", "agg">;
	count: F<0, 1, "integer", "never", "agg">;
	group_concat: F<1, 2, "text", "agg", "agg", Text>;
	string_agg: F<2, 2, "text", "agg", "agg", Text>;
	sum: F<1, 1, "sum", "agg", "agg", Num>;
	total: F<1, 1, "real", "never", "agg", Num>;
	json_group_array: F<1, 1, "text", "never", "agg">;
	jsonb_group_array: F<1, 1, "blob", "never", "agg">;
	json_group_object: F<2, 2, "text", "never", "agg">;
	jsonb_group_object: F<2, 2, "blob", "never", "agg">;

	row_number: F<0, 0, "integer", "never", "win">;
	rank: F<0, 0, "integer", "never", "win">;
	dense_rank: F<0, 0, "integer", "never", "win">;
	percent_rank: F<0, 0, "real", "never", "win">;
	cume_dist: F<0, 0, "real", "never", "win">;
	ntile: F<1, 1, "integer", "never", "win", Num>;
	lag: F<1, 3, "arg0", "always", "win", Offset>;
	lead: F<1, 3, "arg0", "always", "win", Offset>;
	first_value: F<1, 1, "arg0", "arg0", "win">;
	last_value: F<1, 1, "arg0", "arg0", "win">;
	nth_value: F<2, 2, "arg0", "always", "win", Offset>;
}

export type Fn = {
	readonly min: number;
	readonly max: number;
	readonly ret: string;
	readonly null: NullRule;
	readonly kind: "scalar" | "agg" | "win";
};

export type IsAggCall<E, DB> = E extends {
	readonly t: "call";
	readonly name: infer N extends string;
	readonly over: null;
	readonly args: readonly unknown[];
}
	? DeclaredFn<DB, N, FunctionCatalog> extends infer D
		? D extends null
			? N extends "min" | "max"
				? E["args"]["length"] extends 1
					? true
					: false
				: N extends keyof Functions
					? Functions[N]["kind"] extends "agg"
						? true
						: false
					: false
			: PickSig<D, E["args"]["length"]> extends { readonly agg: true }
				? true
				: false
		: never
	: false;

export interface FunctionCatalog {}

export type SigFlags = {
	readonly nullable?: boolean;
	readonly agg?: boolean;
	readonly window?: boolean;
};

export type Sig<
	Args extends readonly string[],
	Ret extends string,
	Flags extends SigFlags = {},
> = {
	readonly args: Args;
	readonly ret: Ret;
} & Flags;

export type AnySig = {
	readonly args: readonly string[];
	readonly ret: string;
} & SigFlags;

export type FunctionRegistry = {
	readonly [name: string]: AnySig | readonly AnySig[];
};

export type SigFn<S> = S extends AnySig
	? {
			readonly min: MinArgs<S["args"]>;
			readonly max: MaxArgs<S["args"]>;
			readonly ret: S["ret"];
			readonly null: S["nullable"] extends true
				? "always"
				: S["nullable"] extends false
					? "never"
					: S["agg"] extends true
						? "agg"
						: "args";
			readonly kind: S["agg"] extends true
				? "agg"
				: S["window"] extends true
					? "win"
					: "scalar";
		}
	: never;
