type F<
	Min extends number,
	Max extends number,
	Ret extends string,
	Null extends NullRule,
	Kind extends "scalar" | "agg" | "win" = "scalar",
> = {
	readonly min: Min;
	readonly max: Max;
	readonly ret: Ret;
	readonly null: Null;
	readonly kind: Kind;
};

export type NullRule =
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

type Many = 1000;

export interface Functions {
	abs: F<1, 1, "abs", "args">;
	changes: F<0, 0, "integer", "never">;
	char: F<0, Many, "text", "never">;
	coalesce: F<2, Many, "common", "all">;
	concat: F<1, Many, "text", "never">;
	concat_ws: F<2, Many, "text", "arg0">;
	format: F<1, Many, "text", "format">;
	printf: F<1, Many, "text", "format">;
	glob: F<2, 2, "integer", "args">;
	hex: F<1, 1, "text", "never">;
	ifnull: F<2, 2, "common", "all">;
	iif: F<2, Many, "iif", "iif">;
	if: F<2, Many, "iif", "iif">;
	instr: F<2, 2, "integer", "args">;
	last_insert_rowid: F<0, 0, "integer", "never">;
	length: F<1, 1, "integer", "args">;
	like: F<2, 3, "integer", "args">;
	likelihood: F<2, 2, "arg0", "arg0">;
	likely: F<1, 1, "arg0", "arg0">;
	lower: F<1, 1, "text", "args">;
	ltrim: F<1, 2, "text", "args">;
	max: F<1, Many, "common", "args">;
	min: F<1, Many, "common", "args">;
	nullif: F<2, 2, "arg0", "always">;
	octet_length: F<1, 1, "integer", "args">;
	quote: F<1, 1, "text", "never">;
	random: F<0, 0, "integer", "never">;
	randomblob: F<1, 1, "blob", "never">;
	replace: F<3, 3, "text", "args">;
	round: F<1, 2, "real", "args">;
	rtrim: F<1, 2, "text", "args">;
	sign: F<1, 1, "integer", "sign">;
	sqlite_compileoption_get: F<1, 1, "text", "always">;
	sqlite_compileoption_used: F<1, 1, "integer", "args">;
	sqlite_source_id: F<0, 0, "text", "never">;
	sqlite_version: F<0, 0, "text", "never">;
	substr: F<2, 3, "substr", "substr">;
	substring: F<2, 3, "substr", "substr">;
	total_changes: F<0, 0, "integer", "never">;
	trim: F<1, 2, "text", "args">;
	typeof: F<1, 1, "text", "never">;
	unhex: F<1, 2, "blob", "always">;
	unicode: F<1, 1, "integer", "always">;
	unlikely: F<1, 1, "arg0", "arg0">;
	upper: F<1, 1, "text", "args">;
	zeroblob: F<1, 1, "blob", "never">;

	date: F<0, Many, "text", "noargs">;
	time: F<0, Many, "text", "noargs">;
	datetime: F<0, Many, "text", "noargs">;
	julianday: F<0, Many, "real", "noargs">;
	unixepoch: F<0, Many, "integer", "noargs">;
	strftime: F<1, Many, "text", "always">;
	timediff: F<2, 2, "text", "always">;

	acos: F<1, 1, "real", "always">;
	acosh: F<1, 1, "real", "always">;
	asin: F<1, 1, "real", "always">;
	asinh: F<1, 1, "real", "numargs">;
	atan: F<1, 1, "real", "numargs">;
	atan2: F<2, 2, "real", "numargs">;
	atanh: F<1, 1, "real", "always">;
	ceil: F<1, 1, "ceil", "sign">;
	ceiling: F<1, 1, "ceil", "sign">;
	cos: F<1, 1, "real", "numargs">;
	cosh: F<1, 1, "real", "numargs">;
	degrees: F<1, 1, "real", "numargs">;
	exp: F<1, 1, "real", "numargs">;
	floor: F<1, 1, "ceil", "sign">;
	ln: F<1, 1, "real", "always">;
	log: F<1, 2, "real", "always">;
	log10: F<1, 1, "real", "always">;
	log2: F<1, 1, "real", "always">;
	mod: F<2, 2, "real", "always">;
	pi: F<0, 0, "real", "never">;
	pow: F<2, 2, "real", "always">;
	power: F<2, 2, "real", "always">;
	radians: F<1, 1, "real", "numargs">;
	sin: F<1, 1, "real", "numargs">;
	sinh: F<1, 1, "real", "numargs">;
	sqrt: F<1, 1, "real", "always">;
	tan: F<1, 1, "real", "numargs">;
	tanh: F<1, 1, "real", "numargs">;
	trunc: F<1, 1, "ceil", "sign">;

	json: F<1, 1, "text", "args">;
	jsonb: F<1, 1, "blob", "args">;
	json_array: F<0, Many, "text", "never">;
	jsonb_array: F<0, Many, "blob", "never">;
	json_array_length: F<1, 2, "integer", "always">;
	json_error_position: F<1, 1, "integer", "args">;
	json_extract: F<2, Many, "jsonext", "always">;
	jsonb_extract: F<2, Many, "any", "always">;
	json_insert: F<1, Many, "text", "arg0">;
	jsonb_insert: F<1, Many, "blob", "arg0">;
	json_object: F<0, Many, "text", "never">;
	jsonb_object: F<0, Many, "blob", "never">;
	json_patch: F<2, 2, "text", "args">;
	jsonb_patch: F<2, 2, "blob", "args">;
	json_pretty: F<1, 2, "text", "arg0">;
	json_quote: F<1, 1, "text", "never">;
	json_remove: F<1, Many, "text", "arg0">;
	jsonb_remove: F<1, Many, "blob", "arg0">;
	json_replace: F<1, Many, "text", "arg0">;
	jsonb_replace: F<1, Many, "blob", "arg0">;
	json_set: F<1, Many, "text", "arg0">;
	jsonb_set: F<1, Many, "blob", "arg0">;
	json_type: F<1, 2, "text", "always">;
	json_valid: F<1, 2, "integer", "arg0">;

	avg: F<1, 1, "real", "agg", "agg">;
	count: F<0, 1, "integer", "never", "agg">;
	group_concat: F<1, 2, "text", "agg", "agg">;
	string_agg: F<2, 2, "text", "agg", "agg">;
	sum: F<1, 1, "sum", "agg", "agg">;
	total: F<1, 1, "real", "never", "agg">;
	json_group_array: F<1, 1, "text", "never", "agg">;
	jsonb_group_array: F<1, 1, "blob", "never", "agg">;
	json_group_object: F<2, 2, "text", "never", "agg">;
	jsonb_group_object: F<2, 2, "blob", "never", "agg">;

	row_number: F<0, 0, "integer", "never", "win">;
	rank: F<0, 0, "integer", "never", "win">;
	dense_rank: F<0, 0, "integer", "never", "win">;
	percent_rank: F<0, 0, "real", "never", "win">;
	cume_dist: F<0, 0, "real", "never", "win">;
	ntile: F<1, 1, "integer", "never", "win">;
	lag: F<1, 3, "arg0", "always", "win">;
	lead: F<1, 3, "arg0", "always", "win">;
	first_value: F<1, 1, "arg0", "arg0", "win">;
	last_value: F<1, 1, "arg0", "arg0", "win">;
	nth_value: F<2, 2, "arg0", "always", "win">;
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
	? DeclaredFn<DB, N> extends infer D
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

type MatchName<O, N extends string> = {
	[K in keyof O & string]: Lowercase<K> extends N ? O[K] : never;
}[keyof O & string];

export type DeclaredFn<DB, N extends string> = (
	DB extends { readonly $functions: infer F }
		? MatchName<F, N>
		: never
) extends infer D
	? [D] extends [never]
		? MatchName<FunctionCatalog, N> extends infer C
			? [C] extends [never]
				? null
				: C
			: never
		: D
	: never;

export type PickSig<D, Argc extends number> = D extends readonly unknown[]
	? PickLoop<D, Argc, 0>
	: D;
type PickLoop<
	D extends readonly unknown[],
	Argc extends number,
	I extends number,
> = D[I] extends infer S extends AnySig
	? Accepts<S["args"], Argc> extends true
		? S
		: PickLoop<D, Argc, [...Tup<I>, 0]["length"] & number>
	: D[0];

type Tup<N extends number, A extends unknown[] = []> = A["length"] extends N
	? A
	: Tup<N, [...A, 0]>;
type Required_<A extends readonly string[]> = A extends readonly [
	...infer H extends readonly string[],
	"...",
]
	? H["length"]
	: A["length"];
type Accepts<
	A extends readonly string[],
	N extends number,
> = A extends readonly [...unknown[], "..."]
	? Tup<N> extends [...Tup<Required_<A>>, ...unknown[]]
		? true
		: false
	: N extends A["length"]
		? true
		: false;

export type SigFn<S> = S extends AnySig
	? {
			readonly min: Required_<S["args"]>;
			readonly max: S["args"] extends readonly [...unknown[], "..."]
				? Many
				: S["args"]["length"];
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

export type SigArgType<S, I extends number> = S extends AnySig
	? S["args"][I] extends infer T extends string
		? T extends "..."
			? S["args"] extends readonly [...unknown[], infer P extends string, "..."]
				? P
				: "unknown"
			: T
		: S["args"] extends readonly [...unknown[], infer P extends string, "..."]
			? P
			: "unknown"
	: "unknown";
