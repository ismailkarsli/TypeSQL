import type { ColInfo, Info } from "../../../engine/types.js";
import type { SqlError } from "../../../errors.js";
import type { DeclaredSig, Sig, SigFlags } from "../../schema/functions.js";
import type {
	DateTimeT,
	JsonT,
	NumT,
	PgTypeFacts,
	RangeT,
	StrT,
} from "../../schema/type-facts.js";
import type { SchemaFunctions } from "../db.js";
import type { JsonRet } from "../json.js";
import type {
	ArrInfo,
	ElemNull,
	HasNullElems,
	LitToText,
	TypeDisplay,
} from "../shape.js";
import type { SelectCommon, UnmatchedErr } from "./operators.js";
import type { PgFunctions } from "./pg-functions.js";

/** Behaviour only built-in functions declare. */
type CatalogFlags = {
	/**
	 * The result array's elements can be NULL, always or when one of these
	 * arguments (1-based) can be NULL or is an array whose elements can be.
	 */
	readonly elems?: true | readonly number[];
	/** The first argument is anyelement: an untyped literal or NULL can't fill it. */
	readonly poly?: true;
	/** A hypothetical-set aggregate, which needs WITHIN GROUP. */
	readonly hypothetical?: true;
	/** NULL for an argument of type unknown (COLLATION FOR). */
	readonly untypedNull?: true;
	/** Builds an object whose keys are the literal odd arguments. */
	readonly object?: true;
	/** A set-returning function's columns in FROM. */
	readonly cols?: readonly { readonly n: string; readonly t: ColInfo }[];
	/** In FROM, its one column is named this rather than after the function. */
	readonly column?: string;
	/** Returns record: FROM needs a column definition list. */
	readonly coldefs?: true;
};
type ESig<
	Args extends readonly string[],
	Ret extends string,
	Flags extends SigFlags & CatalogFlags,
> = { readonly args: Args; readonly ret: Ret } & Flags;
export type AnySig = DeclaredSig & CatalogFlags;

type Agg = { agg: true };
/** array_agg: the elements are the argument's values. */
type AggElems = { agg: true; elems: [1] };
type AggCollect = { agg: true; strict: false };
type AggNN = { agg: true; nullable: false };
/** NULL even over non-null input, e.g. for a single row or zero variance. */
type AggNullable = { agg: true; nullable: true };
type Win = { window: true; nullable: false };
/** A window function over anyelement. */
type WinPoly = { window: true; nullable: true; poly: true };
type Hypothetical = { agg: true; nullable: false; hypothetical: true };
type NN = { nullable: false };
type Nullable = { nullable: true };
type Srf = { srf: true };
/** regexp_match(es): a group that takes no part in the match is NULL. */
type NullableElems = { nullable: true; elems: true };
type SrfElems = { srf: true; elems: true };
/** json_each's columns. */
type KeyValue<V extends string, N extends boolean = false> = [
	{ readonly n: "key"; readonly t: Info<"text"> },
	{ readonly n: "value"; readonly t: Info<V, N> },
];

/** Ordered overloads for each supported number of trailing optional arguments. */
type OptionalArgs<
	Args extends readonly string[],
	Optional extends readonly string[],
	Ret extends string,
	Flags extends SigFlags & CatalogFlags = {},
> = [
	ESig<Args, Ret, Flags>,
	...(Optional extends readonly [
		infer H extends string,
		...infer R extends readonly string[],
	]
		? OptionalArgs<[...Args, H], R, Ret, Flags>
		: []),
];

export interface FunctionCatalog {
	count: Sig<["..."], "int8", AggNN>;
	sum: [
		Sig<["int2"], "int8", Agg>,
		Sig<["int4"], "int8", Agg>,
		Sig<["int8"], "numeric", Agg>,
		Sig<["numeric"], "numeric", Agg>,
		Sig<["float4"], "float4", Agg>,
		Sig<["float8"], "float8", Agg>,
		Sig<["interval"], "interval", Agg>,
		Sig<["money"], "money", Agg>,
	];
	avg: [
		Sig<["int2"], "numeric", Agg>,
		Sig<["int4"], "numeric", Agg>,
		Sig<["int8"], "numeric", Agg>,
		Sig<["numeric"], "numeric", Agg>,
		Sig<["float4"], "float8", Agg>,
		Sig<["float8"], "float8", Agg>,
		Sig<["interval"], "interval", Agg>,
	];
	min: Sig<["any"], "$1", Agg>;
	max: Sig<["any"], "$1", Agg>;
	any_value: ESig<["any"], "$1", { agg: true; poly: true }>;
	array_agg: ESig<["any"], "$arr1", AggElems>;
	string_agg: [
		Sig<["bytea", "bytea"], "bytea", Agg>,
		Sig<["anystring", "anystring"], "text", Agg>,
	];
	json_agg: Sig<["any"], "$jarr:json", AggCollect>;
	jsonb_agg: Sig<["any"], "$jarr:jsonb", AggCollect>;
	json_agg_strict: Sig<["any"], "$jarrnn:json", AggCollect>;
	jsonb_agg_strict: Sig<["any"], "$jarrnn:jsonb", AggCollect>;
	json_object_agg: Sig<["any", "any"], "$jrec:json", AggCollect>;
	jsonb_object_agg: Sig<["any", "any"], "$jrec:jsonb", AggCollect>;
	json_object_agg_strict: Sig<["any", "any"], "$jrecnn:json", AggCollect>;
	jsonb_object_agg_strict: Sig<["any", "any"], "$jrecnn:jsonb", AggCollect>;
	json_object_agg_unique: Sig<["any", "any"], "$jrec:json", AggCollect>;
	jsonb_object_agg_unique: Sig<["any", "any"], "$jrec:jsonb", AggCollect>;
	json_object_agg_unique_strict: FunctionCatalog["json_object_agg_strict"];
	jsonb_object_agg_unique_strict: FunctionCatalog["jsonb_object_agg_strict"];
	bool_and: Sig<["bool"], "bool", Agg>;
	bool_or: Sig<["bool"], "bool", Agg>;
	every: Sig<["bool"], "bool", Agg>;
	bit_and: Sig<["any"], "$1", Agg>;
	bit_or: Sig<["any"], "$1", Agg>;
	bit_xor: Sig<["any"], "$1", Agg>;
	stddev: [
		Sig<["float4"], "float8", AggNullable>,
		Sig<["float8"], "float8", AggNullable>,
		Sig<["anynumeric"], "numeric", AggNullable>,
	];
	stddev_pop: [
		Sig<["float4"], "float8", Agg>,
		Sig<["float8"], "float8", Agg>,
		Sig<["anynumeric"], "numeric", Agg>,
	];
	stddev_samp: FunctionCatalog["stddev"];
	variance: FunctionCatalog["stddev"];
	var_pop: FunctionCatalog["stddev_pop"];
	var_samp: FunctionCatalog["stddev"];
	corr: Sig<["float8", "float8"], "float8", AggNullable>;
	covar_pop: Sig<["float8", "float8"], "float8", Agg>;
	covar_samp: Sig<["float8", "float8"], "float8", AggNullable>;
	regr_avgx: Sig<["float8", "float8"], "float8", Agg>;
	regr_avgy: Sig<["float8", "float8"], "float8", Agg>;
	regr_count: Sig<["float8", "float8"], "int8", AggNN>;
	regr_intercept: Sig<["float8", "float8"], "float8", AggNullable>;
	regr_r2: Sig<["float8", "float8"], "float8", AggNullable>;
	regr_slope: Sig<["float8", "float8"], "float8", AggNullable>;
	regr_sxx: Sig<["float8", "float8"], "float8", Agg>;
	regr_sxy: Sig<["float8", "float8"], "float8", Agg>;
	regr_syy: Sig<["float8", "float8"], "float8", Agg>;
	percentile_cont: [
		ESig<["float8[]"], "$pctarr", AggElems>,
		Sig<["float8"], "$pct", Agg>,
	];
	percentile_disc: [
		ESig<["float8[]"], "$wgarr", AggElems>,
		Sig<["float8"], "$wg", Agg>,
	];
	mode: Sig<[], "$wg", Agg>;
	range_agg: Sig<["anyrange"], "$multirange1", Agg>;
	range_intersect_agg: Sig<["anyrange"], "$1", Agg>;
	xmlagg: Sig<["xml"], "xml", Agg>;

	row_number: Sig<[], "int8", Win>;
	rank: [Sig<[], "int8", Win>, ESig<["any", "..."], "int8", Hypothetical>];
	dense_rank: [
		Sig<[], "int8", Win>,
		ESig<["any", "..."], "int8", Hypothetical>,
	];
	percent_rank: [
		Sig<[], "float8", Win>,
		ESig<["any", "..."], "float8", Hypothetical>,
	];
	cume_dist: [
		Sig<[], "float8", Win>,
		ESig<["any", "..."], "float8", Hypothetical>,
	];
	ntile: Sig<["int4"], "int4", { window: true }>;
	lag: [
		ESig<["any"], "$1", WinPoly>,
		ESig<["any", "int4"], "$1", WinPoly>,
		Sig<["any", "int4", "any"], "$1", { window: true }>,
	];
	lead: FunctionCatalog["lag"];
	first_value: ESig<["any"], "$1", WinPoly>;
	last_value: ESig<["any"], "$1", WinPoly>;
	nth_value: ESig<["any", "int4"], "$1", WinPoly>;

	coalesce: Sig<["..."], "$common", { strict: false }>;
	nullif: Sig<["any", "any"], "$eq", Nullable>;
	greatest: Sig<["any", "..."], "$common", { strict: false }>;
	least: Sig<["any", "..."], "$common", { strict: false }>;
	grouping: Sig<["..."], "int4", NN>;

	lower: [
		Sig<["anystring"], "text">,
		Sig<["anyrange"], "$rangeelem1", Nullable>,
	];
	upper: FunctionCatalog["lower"];
	initcap: Sig<["anystring"], "text">;
	length: [
		Sig<["anystring"], "int4">,
		Sig<["bytea"], "int4">,
		Sig<["bytea", "anystring"], "int4">,
		Sig<["bit"], "int4">,
		Sig<["varbit"], "int4">,
		Sig<["tsvector"], "int4">,
	];
	char_length: Sig<["anystring"], "int4">;
	character_length: Sig<["anystring"], "int4">;
	octet_length: [
		Sig<["anystring"], "int4">,
		Sig<["bytea"], "int4">,
		Sig<["bit"], "int4">,
		Sig<["varbit"], "int4">,
	];
	bit_length: FunctionCatalog["octet_length"];
	bit_count: [
		Sig<["bytea"], "int8">,
		Sig<["bit"], "int8">,
		Sig<["varbit"], "int8">,
	];
	concat: Sig<["any", "..."], "text", NN>;
	concat_ws: Sig<["anystring", "..."], "text", { strict: [1] }>;
	format: Sig<["anystring", "..."], "text", { strict: [1] }>;
	left: Sig<["anystring", "int4"], "text">;
	right: Sig<["anystring", "int4"], "text">;
	lpad: OptionalArgs<["anystring", "int4"], ["anystring"], "text">;
	rpad: FunctionCatalog["lpad"];
	ltrim: [
		Sig<["bytea", "bytea"], "bytea">,
		Sig<["anystring"], "text">,
		Sig<["anystring", "anystring"], "text">,
	];
	rtrim: FunctionCatalog["ltrim"];
	btrim: FunctionCatalog["ltrim"];
	repeat: Sig<["anystring", "int4"], "text">;
	replace: Sig<["anystring", "anystring", "anystring"], "text">;
	reverse: [Sig<["anystring"], "text">, Sig<["bytea"], "bytea">];
	split_part: Sig<["anystring", "anystring", "int4"], "text">;
	strpos: Sig<["anystring", "anystring"], "int4">;
	substr: [
		Sig<["bytea", "int4"], "bytea">,
		Sig<["bytea", "int4", "int4"], "bytea">,
		Sig<["anystring", "int4"], "text">,
		Sig<["anystring", "int4", "int4"], "text">,
	];
	translate: Sig<["anystring", "anystring", "anystring"], "text">;
	starts_with: Sig<["anystring", "anystring"], "bool">;
	ascii: Sig<["anystring"], "int4">;
	chr: Sig<["int4"], "text">;
	quote_ident: Sig<["anystring"], "text">;
	quote_literal: Sig<["any"], "text">;
	quote_nullable: Sig<["any"], "text", NN>;
	regexp_replace: [
		Sig<["anystring", "anystring", "anystring"], "text">,
		Sig<["anystring", "anystring", "anystring", "anystring"], "text">,
		Sig<["anystring", "anystring", "anystring", "int4"], "text">,
		Sig<["anystring", "anystring", "anystring", "int4", "int4"], "text">,
		Sig<
			["anystring", "anystring", "anystring", "int4", "int4", "anystring"],
			"text"
		>,
	];
	regexp_match: OptionalArgs<
		["anystring", "anystring"],
		["anystring"],
		"text[]",
		NullableElems
	>;
	regexp_matches: OptionalArgs<
		["anystring", "anystring"],
		["anystring"],
		"text[]",
		SrfElems
	>;
	regexp_split_to_array: OptionalArgs<
		["anystring", "anystring"],
		["anystring"],
		"text[]"
	>;
	regexp_split_to_table: OptionalArgs<
		["anystring", "anystring"],
		["anystring"],
		"text",
		Srf
	>;
	regexp_count: OptionalArgs<
		["anystring", "anystring"],
		["int4", "anystring"],
		"int4"
	>;
	regexp_like: OptionalArgs<["anystring", "anystring"], ["anystring"], "bool">;
	regexp_instr: OptionalArgs<
		["anystring", "anystring"],
		["int4", "int4", "int4", "anystring", "int4"],
		"int4"
	>;
	regexp_substr: OptionalArgs<
		["anystring", "anystring"],
		["int4", "int4", "anystring", "int4"],
		"text",
		Nullable
	>;
	string_to_array: [
		Sig<["anystring", "anystring"], "text[]", { strict: [1] }>,
		ESig<
			["anystring", "anystring", "anystring"],
			"text[]",
			{ strict: [1]; elems: true }
		>,
	];
	string_to_table: OptionalArgs<
		["anystring", "anystring"],
		["anystring"],
		"text",
		{ srf: true; strict: [1] }
	>;
	to_hex: Sig<["anynumeric"], "text">;
	to_bin: Sig<["anynumeric"], "text">;
	to_oct: Sig<["anynumeric"], "text">;
	to_char: [
		Sig<["timestamptz", "anystring"], "text", Nullable>,
		Sig<["timestamp", "anystring"], "text", Nullable>,
		Sig<["date", "anystring"], "text", Nullable>,
		Sig<["interval", "anystring"], "text", Nullable>,
		Sig<["any", "anystring"], "text">,
	];
	to_number: Sig<["anystring", "anystring"], "numeric">;
	to_date: Sig<["anystring", "anystring"], "date">;
	to_timestamp: [
		Sig<["anystring", "anystring"], "timestamptz">,
		Sig<["anynumeric"], "timestamptz">,
	];
	parse_ident: OptionalArgs<["anystring"], ["bool"], "text[]">;
	unistr: Sig<["anystring"], "text">;
	normalize: OptionalArgs<["anystring"], ["anystring"], "text">;
	is_normalized: OptionalArgs<["anystring"], ["anystring"], "bool">;
	pg_collation_for: ESig<
		["any"],
		"text",
		{ nullable: false; untypedNull: true }
	>;
	convert_from: Sig<["bytea", "anystring"], "text">;
	convert_to: Sig<["anystring", "anystring"], "bytea">;
	convert: Sig<["bytea", "anystring", "anystring"], "bytea">;
	get_byte: Sig<["bytea", "int4"], "int4">;
	set_byte: Sig<["bytea", "int4", "int4"], "bytea">;
	get_bit: [
		Sig<["bytea", "int8"], "int4">,
		Sig<["bit", "int4"], "int4">,
		Sig<["varbit", "int4"], "int4">,
	];
	set_bit: [
		Sig<["bytea", "int8", "int4"], "bytea">,
		Sig<["bit", "int4", "int4"], "bit">,
		Sig<["varbit", "int4", "int4"], "varbit">,
	];
	text: Sig<["any"], "text">;
	md5: [Sig<["bytea"], "text">, Sig<["anystring"], "text">];
	sha224: Sig<["bytea"], "bytea">;
	sha256: Sig<["bytea"], "bytea">;
	sha384: Sig<["bytea"], "bytea">;
	sha512: Sig<["bytea"], "bytea">;
	encode: Sig<["bytea", "anystring"], "text">;
	decode: Sig<["anystring", "anystring"], "bytea">;

	abs: Sig<["anynumeric"], "$1">;
	ceil: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">];
	ceiling: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">];
	floor: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">];
	sign: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">];
	round: [
		Sig<["float8"], "float8">,
		Sig<["numeric"], "numeric">,
		Sig<["numeric", "int4"], "numeric">,
	];
	trunc: [
		Sig<["float8"], "float8">,
		Sig<["numeric"], "numeric">,
		Sig<["numeric", "int4"], "numeric">,
		Sig<["macaddr"], "macaddr">,
		Sig<["macaddr8"], "macaddr8">,
	];
	mod: [
		Sig<["int2", "int2"], "int2">,
		Sig<["int4", "int4"], "int4">,
		Sig<["int8", "int8"], "int8">,
		Sig<["numeric", "numeric"], "numeric">,
	];
	div: Sig<["numeric", "numeric"], "numeric">;
	power: [
		Sig<["float8", "float8"], "float8">,
		Sig<["numeric", "numeric"], "numeric">,
	];
	sqrt: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">];
	cbrt: Sig<["float8"], "float8">;
	exp: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">];
	ln: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">];
	log: [
		Sig<["float8"], "float8">,
		Sig<["numeric"], "numeric">,
		Sig<["numeric", "numeric"], "numeric">,
	];
	log10: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">];
	pi: Sig<[], "float8", NN>;
	random: [
		Sig<[], "float8", NN>,
		Sig<["int4", "int4"], "int4">,
		Sig<["int8", "int8"], "int8">,
		Sig<["numeric", "numeric"], "numeric">,
	];
	random_normal: Sig<["..."], "float8">;
	setseed: Sig<["float8"], "void">;
	width_bucket: [
		Sig<["anynumeric", "anynumeric", "anynumeric", "int4"], "int4">,
		Sig<["any", "anyarray"], "int4">,
	];
	scale: Sig<["numeric"], "int4">;
	min_scale: Sig<["numeric"], "int4">;
	trim_scale: Sig<["numeric"], "numeric">;
	gcd: [
		Sig<["int4", "int4"], "int4">,
		Sig<["int8", "int8"], "int8">,
		Sig<["numeric", "numeric"], "numeric">,
	];
	lcm: FunctionCatalog["gcd"];
	factorial: Sig<["int8"], "numeric">;
	sin: Sig<["float8"], "float8">;
	cos: Sig<["float8"], "float8">;
	tan: Sig<["float8"], "float8">;
	cot: Sig<["float8"], "float8">;
	asin: Sig<["float8"], "float8">;
	acos: Sig<["float8"], "float8">;
	atan: Sig<["float8"], "float8">;
	atan2: Sig<["float8", "float8"], "float8">;
	sinh: Sig<["float8"], "float8">;
	cosh: Sig<["float8"], "float8">;
	tanh: Sig<["float8"], "float8">;
	asinh: Sig<["float8"], "float8">;
	acosh: Sig<["float8"], "float8">;
	atanh: Sig<["float8"], "float8">;
	sind: Sig<["float8"], "float8">;
	cosd: Sig<["float8"], "float8">;
	tand: Sig<["float8"], "float8">;
	cotd: Sig<["float8"], "float8">;
	asind: Sig<["float8"], "float8">;
	acosd: Sig<["float8"], "float8">;
	atand: Sig<["float8"], "float8">;
	atan2d: Sig<["float8", "float8"], "float8">;
	degrees: Sig<["float8"], "float8">;
	radians: Sig<["float8"], "float8">;
	erf: Sig<["float8"], "float8">;
	erfc: Sig<["float8"], "float8">;

	now: Sig<[], "timestamptz", NN>;
	clock_timestamp: Sig<[], "timestamptz", NN>;
	statement_timestamp: Sig<[], "timestamptz", NN>;
	transaction_timestamp: Sig<[], "timestamptz", NN>;
	timeofday: Sig<[], "text", NN>;
	current_date: Sig<[], "date", NN>;
	current_time: Sig<[], "timetz", NN>;
	current_timestamp: Sig<[], "timestamptz", NN>;
	localtime: Sig<[], "time", NN>;
	localtimestamp: Sig<[], "timestamp", NN>;
	age: OptionalArgs<["anydatetime"], ["anydatetime"], "interval">;
	date_part: Sig<["anystring", "any"], "float8">;
	date_trunc: [
		Sig<["anystring", "timestamptz"], "timestamptz">,
		Sig<["anystring", "timestamp"], "timestamp">,
		Sig<["anystring", "interval"], "interval">,
		Sig<["anystring", "timestamptz", "anystring"], "timestamptz">,
	];
	date_bin: [
		Sig<["interval", "timestamptz", "timestamptz"], "timestamptz">,
		Sig<["interval", "timestamp", "timestamp"], "timestamp">,
	];
	date_add: OptionalArgs<
		["timestamptz", "interval"],
		["anystring"],
		"timestamptz"
	>;
	date_subtract: FunctionCatalog["date_add"];
	make_date: Sig<["int4", "int4", "int4"], "date">;
	make_time: Sig<["int4", "int4", "float8"], "time">;
	make_timestamp: Sig<
		["int4", "int4", "int4", "int4", "int4", "float8"],
		"timestamp"
	>;
	make_timestamptz: OptionalArgs<
		["int4", "int4", "int4", "int4", "int4", "float8"],
		["anystring"],
		"timestamptz"
	>;
	make_interval: Sig<["..."], "interval">;
	justify_days: Sig<["interval"], "interval">;
	justify_hours: Sig<["interval"], "interval">;
	justify_interval: Sig<["interval"], "interval">;
	isfinite: Sig<["any"], "bool">;
	overlaps: Sig<["any", "any", "any", "any"], "bool">;
	extract: Sig<["anystring", "any"], "numeric">;
	timezone: [
		Sig<["any", "timestamptz"], "timestamp">,
		Sig<["any", "timestamp"], "timestamptz">,
		Sig<["any", "timetz"], "timetz">,
		Sig<["timestamptz"], "timestamp">,
		Sig<["timestamp"], "timestamptz">,
		Sig<["timetz"], "timetz">,
	];
	generate_series: [
		Sig<["int4", "int4"], "int4", Srf>,
		Sig<["int4", "int4", "int4"], "int4", Srf>,
		Sig<["int8", "int8"], "int8", Srf>,
		Sig<["int8", "int8", "int8"], "int8", Srf>,
		Sig<["numeric", "numeric"], "numeric", Srf>,
		Sig<["numeric", "numeric", "numeric"], "numeric", Srf>,
		Sig<["timestamptz", "timestamptz", "interval"], "timestamptz", Srf>,
		Sig<["timestamp", "timestamp", "interval"], "timestamp", Srf>,
		Sig<
			["timestamptz", "timestamptz", "interval", "anystring"],
			"timestamptz",
			Srf
		>,
	];
	generate_subscripts: OptionalArgs<
		["anyarray", "int4"],
		["bool"],
		"int4",
		Srf
	>;

	current_user: Sig<[], "name", NN>;
	current_role: Sig<[], "name", NN>;
	session_user: Sig<[], "name", NN>;
	system_user: Sig<[], "text", Nullable>;
	user: Sig<[], "name", NN>;
	current_catalog: Sig<[], "name", NN>;
	current_schema: Sig<[], "name", NN>;
	current_database: Sig<[], "name", NN>;
	current_schemas: Sig<["bool"], "name[]">;
	current_query: Sig<[], "text", Nullable>;
	current_setting: [
		Sig<["anystring"], "text">,
		Sig<["anystring", "bool"], "text", Nullable>,
	];
	set_config: Sig<["anystring", "anystring", "bool"], "text">;
	pg_backend_pid: Sig<[], "int4", NN>;
	pg_cancel_backend: Sig<["int4"], "bool">;
	pg_terminate_backend: OptionalArgs<["int4"], ["int8"], "bool">;
	version: Sig<[], "text", NN>;
	merge_action: Sig<[], "text", NN>;
	pg_typeof: Sig<["any"], "regtype", NN>;
	pg_column_size: Sig<["any"], "int4">;
	pg_size_pretty: [Sig<["int8"], "text">, Sig<["numeric"], "text">];
	pg_total_relation_size: Sig<["any"], "int8">;
	pg_relation_size: OptionalArgs<["any"], ["anystring"], "int8">;
	pg_database_size: Sig<["any"], "int8">;
	pg_postmaster_start_time: Sig<[], "timestamptz", NN>;
	pg_conf_load_time: Sig<[], "timestamptz", NN>;
	pg_is_in_recovery: Sig<[], "bool", NN>;
	inet_client_addr: Sig<[], "inet", Nullable>;
	inet_server_addr: Sig<[], "inet", Nullable>;
	obj_description: OptionalArgs<["any"], ["anystring"], "text", Nullable>;
	col_description: Sig<["any", "int4"], "text", Nullable>;
	to_regclass: Sig<["anystring"], "regclass", Nullable>;
	to_regtype: Sig<["anystring"], "regtype", Nullable>;
	to_regproc: Sig<["anystring"], "regproc", Nullable>;
	pg_sleep: Sig<["float8"], "void">;
	pg_sleep_for: Sig<["interval"], "void">;
	pg_sleep_until: Sig<["timestamptz"], "void">;
	pg_advisory_lock: [Sig<["int8"], "void">, Sig<["int4", "int4"], "void">];
	pg_advisory_xact_lock: [Sig<["int8"], "void">, Sig<["int4", "int4"], "void">];
	pg_try_advisory_lock: [Sig<["int8"], "bool">, Sig<["int4", "int4"], "bool">];
	pg_advisory_unlock: [Sig<["int8"], "bool">, Sig<["int4", "int4"], "bool">];
	pg_notify: Sig<["anystring", "anystring"], "void">;
	txid_current: Sig<[], "int8", NN>;
	pg_current_xact_id: Sig<[], "xid8", NN>;
	num_nulls: Sig<["..."], "int4", NN>;
	num_nonnulls: Sig<["..."], "int4", NN>;

	nextval: Sig<["any"], "int8">;
	currval: Sig<["any"], "int8">;
	setval: OptionalArgs<["any", "int8"], ["bool"], "int8">;
	lastval: Sig<[], "int8", NN>;

	gen_random_uuid: Sig<[], "uuid", NN>;
	uuid_generate_v1: Sig<[], "uuid", NN>;
	uuid_generate_v1mc: Sig<[], "uuid", NN>;
	uuid_generate_v3: Sig<["uuid", "anystring"], "uuid">;
	uuid_generate_v4: Sig<[], "uuid", NN>;
	uuid_generate_v5: Sig<["uuid", "anystring"], "uuid">;
	uuid_nil: Sig<[], "uuid", NN>;
	uuid_extract_timestamp: Sig<["uuid"], "timestamptz", Nullable>;
	uuid_extract_version: Sig<["uuid"], "int2", Nullable>;
	gen_random_bytes: Sig<["int4"], "bytea">;
	digest: [
		Sig<["bytea", "anystring"], "bytea">,
		Sig<["anystring", "anystring"], "bytea">,
	];
	hmac: [
		Sig<["bytea", "bytea", "anystring"], "bytea">,
		Sig<["anystring", "anystring", "anystring"], "bytea">,
	];
	crypt: Sig<["anystring", "anystring"], "text">;
	gen_salt: OptionalArgs<["anystring"], ["int4"], "text">;

	unaccent: [Sig<["anystring"], "text">, Sig<["any", "anystring"], "text">];
	similarity: Sig<["anystring", "anystring"], "float4">;
	word_similarity: Sig<["anystring", "anystring"], "float4">;
	strict_word_similarity: Sig<["anystring", "anystring"], "float4">;
	show_trgm: Sig<["anystring"], "text[]">;
	levenshtein: [
		Sig<["anystring", "anystring"], "int4">,
		Sig<["anystring", "anystring", "int4", "int4", "int4"], "int4">,
	];
	levenshtein_less_equal: [
		Sig<["anystring", "anystring", "int4"], "int4">,
		Sig<["anystring", "anystring", "int4", "int4", "int4", "int4"], "int4">,
	];
	soundex: Sig<["anystring"], "text">;
	difference: Sig<["anystring", "anystring"], "int4">;
	metaphone: Sig<["anystring", "int4"], "text">;
	dmetaphone: Sig<["anystring"], "text">;
	dmetaphone_alt: Sig<["anystring"], "text">;

	unnest: [Sig<["anyarray"], "$elem1", Srf>, Sig<["anyrange"], "$elem1", Srf>];
	array_length: Sig<["anyarray", "int4"], "int4", Nullable>;
	cardinality: Sig<["anyarray"], "int4">;
	array_append: ESig<["anyarray", "any"], "$1", { strict: [1]; elems: [1, 2] }>;
	array_prepend: ESig<
		["any", "anyarray"],
		"$2",
		{ strict: [2]; elems: [1, 2] }
	>;
	array_cat: ESig<
		["anyarray", "anyarray"],
		"$1",
		{ strict: false; elems: [1, 2] }
	>;
	array_remove: Sig<["anyarray", "any"], "$1", { strict: [1] }>;
	array_replace: ESig<
		["anyarray", "any", "any"],
		"$1",
		{ strict: [1]; elems: [1, 3] }
	>;
	array_position: OptionalArgs<["anyarray", "any"], ["int4"], "int4", Nullable>;
	array_positions: Sig<["anyarray", "any"], "int4[]", { strict: [1] }>;
	array_to_string: [
		Sig<["anyarray", "anystring"], "text">,
		Sig<["anyarray", "anystring", "anystring"], "text", { strict: [1, 2] }>,
	];
	array_upper: Sig<["anyarray", "int4"], "int4", Nullable>;
	array_lower: Sig<["anyarray", "int4"], "int4", Nullable>;
	array_ndims: Sig<["anyarray"], "int4", Nullable>;
	array_dims: Sig<["anyarray"], "text", Nullable>;
	array_fill: OptionalArgs<
		["any", "int4[]"],
		["int4[]"],
		"$arr1",
		{ elems: [1] }
	>;
	array_to_json: OptionalArgs<["anyarray"], ["bool"], "$jval:json">;
	array_sample: Sig<["anyarray", "int4"], "$1">;
	array_shuffle: Sig<["anyarray"], "$1">;
	trim_array: Sig<["anyarray", "int4"], "$1">;

	to_json: Sig<["any"], "$jval:json">;
	to_jsonb: Sig<["any"], "$jval:jsonb">;
	json_build_object: ESig<["..."], "json", { nullable: false; object: true }>;
	jsonb_build_object: ESig<["..."], "jsonb", { nullable: false; object: true }>;
	json_build_array: Sig<["..."], "$jtup:json", NN>;
	jsonb_build_array: Sig<["..."], "$jtup:jsonb", NN>;
	json_object: OptionalArgs<["text[]"], ["text[]"], "json">;
	jsonb_object: OptionalArgs<["text[]"], ["text[]"], "jsonb">;
	json_array_length: Sig<["json"], "int4">;
	jsonb_array_length: Sig<["jsonb"], "int4">;
	json_extract_path: Sig<["json", "..."], "json", Nullable>;
	jsonb_extract_path: Sig<["jsonb", "..."], "jsonb", Nullable>;
	json_extract_path_text: Sig<["json", "..."], "text", Nullable>;
	jsonb_extract_path_text: Sig<["jsonb", "..."], "text", Nullable>;
	json_typeof: Sig<["json"], "text">;
	jsonb_typeof: Sig<["jsonb"], "text">;
	json_strip_nulls: OptionalArgs<["json"], ["bool"], "json">;
	jsonb_strip_nulls: OptionalArgs<["jsonb"], ["bool"], "jsonb">;
	jsonb_set: OptionalArgs<["jsonb", "text[]", "jsonb"], ["bool"], "jsonb">;
	jsonb_set_lax: OptionalArgs<
		["jsonb", "text[]", "jsonb"],
		["bool", "anystring"],
		"jsonb",
		{ strict: [1, 2] }
	>;
	jsonb_insert: FunctionCatalog["jsonb_set"];
	jsonb_pretty: Sig<["jsonb"], "text">;
	jsonb_path_exists: OptionalArgs<
		["jsonb", "jsonpath"],
		["jsonb", "bool"],
		"bool"
	>;
	jsonb_path_match: FunctionCatalog["jsonb_path_exists"];
	jsonb_path_query: OptionalArgs<
		["jsonb", "jsonpath"],
		["jsonb", "bool"],
		"jsonb",
		Srf
	>;
	jsonb_path_query_array: OptionalArgs<
		["jsonb", "jsonpath"],
		["jsonb", "bool"],
		"jsonb"
	>;
	jsonb_path_query_first: OptionalArgs<
		["jsonb", "jsonpath"],
		["jsonb", "bool"],
		"jsonb",
		Nullable
	>;
	jsonb_path_exists_tz: FunctionCatalog["jsonb_path_exists"];
	jsonb_path_match_tz: FunctionCatalog["jsonb_path_exists"];
	jsonb_path_query_tz: FunctionCatalog["jsonb_path_query"];
	jsonb_path_query_array_tz: FunctionCatalog["jsonb_path_query_array"];
	jsonb_path_query_first_tz: FunctionCatalog["jsonb_path_query_first"];
	json_array_elements: ESig<
		["json"],
		"$jelem:json",
		{ srf: true; column: "value" }
	>;
	jsonb_array_elements: ESig<
		["jsonb"],
		"$jelem:jsonb",
		{ srf: true; column: "value" }
	>;
	json_array_elements_text: ESig<
		["json"],
		"text",
		{ srf: true; nullable: true; column: "value" }
	>;
	jsonb_array_elements_text: ESig<
		["jsonb"],
		"text",
		{ srf: true; nullable: true; column: "value" }
	>;
	json_each: ESig<["json"], "record", { srf: true; cols: KeyValue<"json"> }>;
	jsonb_each: ESig<["jsonb"], "record", { srf: true; cols: KeyValue<"jsonb"> }>;
	json_each_text: ESig<
		["json"],
		"record",
		{ srf: true; cols: KeyValue<"text", true> }
	>;
	jsonb_each_text: ESig<
		["jsonb"],
		"record",
		{ srf: true; cols: KeyValue<"text", true> }
	>;
	json_object_keys: Sig<["json"], "text", Srf>;
	jsonb_object_keys: Sig<["jsonb"], "text", Srf>;
	row_to_json: OptionalArgs<["any"], ["bool"], "$jval:json">;
	json_populate_record: OptionalArgs<["any", "json"], ["bool"], "$1">;
	jsonb_populate_record: Sig<["any", "jsonb"], "$1">;
	json_populate_recordset: OptionalArgs<["any", "json"], ["bool"], "$1", Srf>;
	jsonb_populate_recordset: Sig<["any", "jsonb"], "$1", Srf>;
	json_to_record: ESig<["json"], "record", { coldefs: true }>;
	jsonb_to_record: ESig<["jsonb"], "record", { coldefs: true }>;
	json_to_recordset: ESig<["json"], "record", { srf: true; coldefs: true }>;
	jsonb_to_recordset: ESig<["jsonb"], "record", { srf: true; coldefs: true }>;
	jsonb_exists: Sig<["jsonb", "anystring"], "bool">;
	jsonb_exists_any: Sig<["jsonb", "text[]"], "bool">;
	jsonb_exists_all: Sig<["jsonb", "text[]"], "bool">;
	jsonb_contains: Sig<["jsonb", "jsonb"], "bool">;
	jsonb_contained: Sig<["jsonb", "jsonb"], "bool">;
	jsonb_concat: Sig<["jsonb", "jsonb"], "jsonb">;
	jsonb_delete: [
		Sig<["jsonb", "anystring"], "jsonb">,
		Sig<["jsonb", "int4"], "jsonb">,
		Sig<["jsonb", "text[]"], "jsonb">,
		Sig<["jsonb", "anystring", "..."], "jsonb">,
	];
	jsonb_delete_path: Sig<["jsonb", "text[]"], "jsonb">;
	json_scalar: Sig<["any"], "json">;

	host: Sig<["inet"], "text">;
	masklen: Sig<["inet"], "int4">;
	network: Sig<["inet"], "cidr">;
	abbrev: Sig<["inet"], "text">;
	broadcast: Sig<["inet"], "inet">;
	family: Sig<["inet"], "int4">;
	hostmask: Sig<["inet"], "inet">;
	netmask: Sig<["inet"], "inet">;
	set_masklen: [Sig<["cidr", "int4"], "cidr">, Sig<["inet", "int4"], "inet">];
	inet_same_family: Sig<["inet", "inet"], "bool">;
	inet_merge: Sig<["inet", "inet"], "cidr">;

	to_tsvector: [
		Sig<["anystring"], "tsvector">,
		Sig<["anyjson"], "tsvector">,
		Sig<["any", "anystring"], "tsvector">,
		Sig<["any", "anyjson"], "tsvector">,
	];
	to_tsquery: [
		Sig<["anystring"], "tsquery">,
		Sig<["any", "anystring"], "tsquery">,
	];
	plainto_tsquery: FunctionCatalog["to_tsquery"];
	phraseto_tsquery: FunctionCatalog["to_tsquery"];
	websearch_to_tsquery: FunctionCatalog["to_tsquery"];
	ts_rank: [
		Sig<["tsvector", "tsquery"], "float4">,
		Sig<["tsvector", "tsquery", "int4"], "float4">,
		Sig<["float4[]", "tsvector", "tsquery"], "float4">,
		Sig<["float4[]", "tsvector", "tsquery", "int4"], "float4">,
	];
	ts_rank_cd: FunctionCatalog["ts_rank"];
	ts_headline: [
		Sig<["anystring", "tsquery"], "text">,
		Sig<["anystring", "tsquery", "anystring"], "text">,
		Sig<["anyjson", "tsquery"], "$1">,
		Sig<["anyjson", "tsquery", "anystring"], "$1">,
		Sig<["any", "anystring", "tsquery"], "text">,
		Sig<["any", "anystring", "tsquery", "anystring"], "text">,
		Sig<["any", "anyjson", "tsquery"], "$2">,
		Sig<["any", "anyjson", "tsquery", "anystring"], "$2">,
	];
	setweight: OptionalArgs<["tsvector", "anystring"], ["text[]"], "tsvector">;
	strip: Sig<["tsvector"], "tsvector">;
	numnode: Sig<["tsquery"], "int4">;
	querytree: Sig<["tsquery"], "text">;
	tsvector_to_array: Sig<["tsvector"], "text[]">;
	array_to_tsvector: Sig<["text[]"], "tsvector">;
	ts_delete: [
		Sig<["tsvector", "anystring"], "tsvector">,
		Sig<["tsvector", "text[]"], "tsvector">,
	];
	ts_filter: Sig<["tsvector", "any"], "tsvector">;
	ts_rewrite: [
		Sig<["tsquery", "anystring"], "tsquery">,
		Sig<["tsquery", "tsquery", "tsquery"], "tsquery">,
	];
	tsquery_phrase: OptionalArgs<["tsquery", "tsquery"], ["int4"], "tsquery">;
	get_current_ts_config: Sig<[], "regconfig", NN>;
	ts_lexize: Sig<["any", "anystring"], "text[]", Nullable>;

	isempty: Sig<["anyrange"], "bool">;
	lower_inc: Sig<["anyrange"], "bool">;
	upper_inc: Sig<["anyrange"], "bool">;
	lower_inf: Sig<["anyrange"], "bool">;
	upper_inf: Sig<["anyrange"], "bool">;
	range_merge: [
		Sig<["anyrange", "anyrange"], "$1">,
		Sig<["anyrange"], "$elem1">,
	];
	int4range: OptionalArgs<["int4", "int4"], ["anystring"], "int4range", NN>;
	int8range: OptionalArgs<["int8", "int8"], ["anystring"], "int8range", NN>;
	numrange: OptionalArgs<["numeric", "numeric"], ["anystring"], "numrange", NN>;
	tsrange: OptionalArgs<
		["timestamp", "timestamp"],
		["anystring"],
		"tsrange",
		NN
	>;
	tstzrange: OptionalArgs<
		["timestamptz", "timestamptz"],
		["anystring"],
		"tstzrange",
		NN
	>;
	daterange: OptionalArgs<["date", "date"], ["anystring"], "daterange", NN>;
	int4multirange: Sig<["..."], "int4multirange", NN>;
	int8multirange: Sig<["..."], "int8multirange", NN>;
	nummultirange: Sig<["..."], "nummultirange", NN>;
	tsmultirange: Sig<["..."], "tsmultirange", NN>;
	tstzmultirange: Sig<["..."], "tstzmultirange", NN>;
	datemultirange: Sig<["..."], "datemultirange", NN>;
	multirange: Sig<["anyrange"], "$multirange1">;

	enum_first: Sig<["any"], "$1", NN>;
	enum_last: Sig<["any"], "$1", NN>;
	enum_range: OptionalArgs<["any"], ["any"], "$arr1", NN>;

	xmlexists: Sig<["text", "xml"], "bool">;
	xpath: OptionalArgs<["text", "xml"], ["text[]"], "xml[]">;
	xpath_exists: OptionalArgs<["text", "xml"], ["text[]"], "bool">;
	xmlcomment: Sig<["text"], "xml">;
	xmltext: Sig<["text"], "xml">;
	xml_is_well_formed: Sig<["text"], "bool">;
	xml_is_well_formed_document: Sig<["text"], "bool">;
	xml_is_well_formed_content: Sig<["text"], "bool">;

	bool: Sig<["..."], "bool">;
	int2: Sig<["..."], "int2">;
	int4: Sig<["..."], "int4">;
	int8: Sig<["..."], "int8">;
	float4: Sig<["..."], "float4">;
	float8: Sig<["..."], "float8">;
	numeric: Sig<["..."], "numeric">;
	money: Sig<["..."], "money">;
	date: Sig<["..."], "date">;
	time: Sig<["..."], "time">;
	timetz: Sig<["..."], "timetz">;
	interval: Sig<["..."], "interval">;
	timestamp: Sig<["..."], "timestamp">;
	timestamptz: Sig<["..."], "timestamptz">;
	bpchar: Sig<["..."], "bpchar">;
	char: Sig<["..."], "char">;
	varchar: Sig<["..."], "varchar">;
	name: Sig<["..."], "name">;
	bit: Sig<["..."], "bit">;
	varbit: Sig<["..."], "varbit">;
	oid: Sig<["..."], "oid">;
	xid: Sig<["..."], "xid">;
	regclass: Sig<["..."], "regclass">;
	xml: Sig<["..."], "xml">;
	cidr: Sig<["..."], "cidr">;
	macaddr: Sig<["..."], "macaddr">;
	macaddr8: Sig<["..."], "macaddr8">;
	point: Sig<["..."], "point">;
	lseg: Sig<["..."], "lseg">;
	box: Sig<["..."], "box">;
	path: Sig<["..."], "path">;
	polygon: Sig<["..."], "polygon">;
	circle: Sig<["..."], "circle">;
}

type ToList<S> = S extends readonly AnySig[]
	? S
	: S extends AnySig
		? readonly [S]
		: readonly [];

export type MatchKind<P extends string, A extends string> = A extends
	| "unknown"
	| "null"
	? "c"
	: A extends "lit"
		? P extends "anystring" | StrT
			? "x"
			: "c"
		: P extends "any" | "..."
			? "c"
			: P extends keyof PolyAccepts
				? A extends PolyAccepts[P]
					? "x"
					: false
				: A extends P
					? "x"
					: A extends "text"
						? "c"
						: P extends `${infer PE}[]`
							? A extends `${infer AE}[]`
								? MatchKind<PE, AE> extends false
									? false
									: "c"
								: false
							: P extends keyof PgTypeFacts
								? PgTypeFacts[P] extends { readonly from: infer F }
									? A extends F
										? "c"
										: false
									: false
								: false;
/**
 * The catalog's argument categories: the types each accepts, and the type a
 * parameter passed for it gets (`unknown` when no one type fits; anyarray's
 * follows the other arguments).
 */
type PolyAccepts = { [P in keyof PolyArgs]: PolyArgs[P]["accepts"] };
export type PolyArgs = {
	anynumeric: { accepts: NumT; param: "float8" };
	anystring: { accepts: StrT; param: "text" };
	anyarray: { accepts: `${string}[]`; param: "unknown" };
	anyjson: { accepts: JsonT; param: "unknown" };
	anydatetime: { accepts: DateTimeT; param: "timestamptz" };
	anyrange: { accepts: RangeT; param: "unknown" };
};
type ArgsMatch<
	Ps extends readonly string[],
	As extends readonly ColInfo[],
	Score extends readonly unknown[],
> = Ps extends readonly ["..."]
	? Score
	: Ps extends readonly [
				infer P extends string,
				...infer PR extends readonly string[],
			]
		? As extends readonly [
				infer A extends ColInfo,
				...infer AR extends readonly ColInfo[],
			]
			? MatchKind<P, A["type"]> extends "x"
				? ArgsMatch<PR, AR, [...Score, 0]>
				: MatchKind<P, A["type"]> extends "c"
					? ArgsMatch<PR, AR, Score>
					: false
			: false
		: As extends readonly []
			? Score
			: false;

type BestSig<
	Sigs extends readonly AnySig[],
	As extends readonly ColInfo[],
	Best,
	BestScore extends readonly unknown[],
> = Sigs extends readonly [
	infer S extends AnySig,
	...infer R extends readonly AnySig[],
]
	? ArgsMatch<S["args"], As, []> extends infer K extends readonly unknown[]
		? Best extends null
			? BestSig<R, As, S, K>
			: K extends readonly [...BestScore, unknown, ...unknown[]]
				? BestSig<R, As, S, K>
				: BestSig<R, As, Best, BestScore>
		: BestSig<R, As, Best, BestScore>
	: Best;

type ArityFallback<
	Sigs extends readonly AnySig[],
	As extends readonly ColInfo[],
> = Sigs extends readonly [
	infer S extends AnySig,
	...infer R extends readonly AnySig[],
]
	? ArityOk<S["args"], As> extends true
		? S
		: ArityFallback<R, As>
	: null;
type ArityOk<
	Ps extends readonly string[],
	As extends readonly ColInfo[],
> = Ps extends readonly [...infer Fixed, "..."]
	? As extends readonly [...{ [K in keyof Fixed]: ColInfo }, ...ColInfo[]]
		? true
		: false
	: Ps["length"] extends As["length"]
		? true
		: false;

export type PickSig<
	Sigs,
	As extends readonly ColInfo[],
> = Sigs extends readonly unknown[]
	? PickOverload<Sigs, As>
	: Sigs extends AnySig
		? number extends Sigs["args"]["length"]
			? PickOverload<Sigs, As>
			: ArityOk<Sigs["args"], As> extends true
				? Sigs
				: null
		: PickOverload<Sigs, As>;
type PickOverload<Sigs, As extends readonly ColInfo[]> =
	BestSig<ToList<Sigs>, As, null, []> extends AnySig
		? BestSig<ToList<Sigs>, As, null, []>
		: ArityFallback<ToList<Sigs>, As>;

type TypeAt<
	As extends readonly ColInfo[],
	I extends number,
> = As[I] extends ColInfo ? LitToText<As[I]["type"]> : "unknown";
/** The common type of the arguments, or `Unmatched` for the first two that have none. */
export type CommonOf<
	As extends readonly ColInfo[],
	Acc extends string = "unknown",
> = As extends readonly [
	infer A extends ColInfo,
	...infer R extends readonly ColInfo[],
]
	? SelectCommon<Acc, A["type"]> extends infer T extends string
		? CommonOf<R, T>
		: SelectCommon<Acc, A["type"]>
	: LitToText<Acc>;

type ElemOf<T extends string> = T extends `${infer E}[]`
	? E
	: T extends `${infer X}multirange`
		? `${X}range`
		: "unknown";
type ArrOf<T extends string> = T extends `${string}[]`
	? T
	: T extends "null"
		? "unknown[]"
		: `${T}[]`;
type RangeSubtype = {
	int4: "int4";
	int8: "int8";
	num: "numeric";
	ts: "timestamp";
	tstz: "timestamptz";
	date: "date";
};
type RangeElem<T extends string> = T extends `${infer X}multirange`
	? X extends keyof RangeSubtype
		? RangeSubtype[X]
		: "unknown"
	: T extends `${infer X}range`
		? X extends keyof RangeSubtype
			? RangeSubtype[X]
			: "unknown"
		: "unknown";
type MultirangeOf<T extends string> = T extends `${string}multirange`
	? T
	: T extends `${infer X}range`
		? `${X}multirange`
		: "unknown";

type CallCtx = {
	readonly grouped: boolean;
	readonly over: boolean;
	readonly emptyFrame?: boolean;
	readonly filter: boolean;
	readonly distinct: boolean;
	readonly hasStar: boolean;
	readonly withinGroup: boolean;
	readonly wg: string;
	/** The first argument is a string literal or NULL written in the call. */
	readonly untypedFirst?: boolean;
};

type RetArg = { $1: 0; $2: 1; $3: 2; $4: 3 };
type Ret<
	R extends string,
	As extends readonly ColInfo[],
	C extends { readonly wg: string },
> = R extends `$${string}`
	? R extends keyof RetArg
		? TypeAt<As, RetArg[R]>
		: R extends "$elem1"
			? ElemOf<TypeAt<As, 0>>
			: R extends "$arr1"
				? ArrOf<TypeAt<As, 0>>
				: R extends "$common" | "$eq"
					? CommonOf<As> extends infer T extends string
						? T
						: "unknown"
					: R extends "$rangeelem1"
						? RangeElem<TypeAt<As, 0>>
						: R extends "$multirange1"
							? MultirangeOf<TypeAt<As, 0>>
							: R extends "$wg"
								? C["wg"]
								: R extends "$wgarr"
									? ArrOf<C["wg"]>
									: R extends "$pct"
										? C["wg"] extends "interval"
											? "interval"
											: "float8"
										: R extends "$pctarr"
											? C["wg"] extends "interval"
												? "interval[]"
												: "float8[]"
											: R extends `$j${infer P}`
												? JsonRet<P, As>
												: R
	: R;

export type AnyNullable<As extends readonly ColInfo[]> = As extends readonly [
	infer A extends ColInfo,
	...infer R extends readonly ColInfo[],
]
	? A["nullable"] extends true
		? true
		: AnyNullable<R>
	: false;
export type AllNullable<As extends readonly ColInfo[]> = As extends readonly [
	infer A extends ColInfo,
	...infer R extends readonly ColInfo[],
]
	? A["nullable"] extends true
		? AllNullable<R>
		: false
	: true;
type ArgAt<As extends readonly ColInfo[], I extends number> = [never, ...As][I];
type AnyNullableAt<
	As extends readonly ColInfo[],
	Idx extends readonly number[],
> = Idx extends readonly [
	infer I extends number,
	...infer R extends readonly number[],
]
	? ArgAt<As, I> extends { readonly nullable: true }
		? true
		: AnyNullableAt<As, R>
	: false;

type CallNullable<
	S extends AnySig,
	As extends readonly ColInfo[],
	C extends CallCtx,
> = S["nullable"] extends false
	? false
	: S["nullable"] extends true
		? true
		: S["agg"] extends true
			? C["filter"] extends true
				? true
				: C["over"] extends true
					? C["emptyFrame"] extends true
						? true
						: S["strict"] extends false
							? false
							: AnyNullable<As>
					: C["grouped"] extends false
						? true
						: S["strict"] extends false
							? false
							: AnyNullable<As>
			: S["strict"] extends false
				? AllNullable<As>
				: S["strict"] extends readonly number[]
					? AnyNullableAt<As, S["strict"]>
					: AnyNullable<As>;

type CallInfo<
	S extends AnySig,
	As extends readonly ColInfo[],
	C extends CallCtx,
> = ArrInfo<
	Ret<S["ret"], As, C>,
	NullableCall<S, As, C> extends true ? true : ElemRetNull<S, As>,
	RetElemsNull<S, As>
>;
type RetElemsNull<
	S extends AnySig,
	As extends readonly ColInfo[],
> = S["elems"] extends true | readonly number[]
	? ElemsNullable<S["elems"], As> extends true
		? true
		: PassedElems<S["ret"], As>
	: PassedElems<S["ret"], As>;
type ElemsNullable<
	E extends true | readonly number[],
	As extends readonly ColInfo[],
> = E extends readonly [
	infer I extends number,
	...infer R extends readonly number[],
]
	? ArgAt<As, I> extends infer A extends ColInfo
		? ElemNull<A> extends true
			? true
			: ElemsNullable<R, As>
		: ElemsNullable<R, As>
	: E extends true
		? true
		: false;
/** A returned argument keeps its elements (array_sample, coalesce, …). */
type PassedElems<
	R extends string,
	As extends readonly ColInfo[],
> = R extends "$arr1"
	? HasNullElems<As[0]>
	: R extends keyof RetArg
		? HasNullElems<As[RetArg[R]]>
		: R extends "$common" | "$eq"
			? HasNullElems<As[number]> extends false
				? false
				: true
			: false;
/** An element taken out of an array whose elements can be NULL (unnest). */
type ElemRetNull<
	S extends AnySig,
	As extends readonly ColInfo[],
> = S["ret"] extends "$elem1" ? HasNullElems<As[0]> : false;

type NullableCall<
	S extends AnySig,
	As extends readonly ColInfo[],
	C extends CallCtx,
> = S["untypedNull"] extends true
	? As extends readonly [{ readonly type: "lit" | "null" | "unknown" }]
		? true
		: CallNullable<S, As, C>
	: CallNullable<S, As, C>;

/** The functions whose odd arguments are object keys (json_build_object). */
export type ObjectBuilders = {
	[K in keyof FunctionCatalog]: FunctionCatalog[K] extends {
		readonly object: true;
	}
		? K
		: never;
}[keyof FunctionCatalog];

/** The names LookupFn finds, which an unknown name's hint picks from. */
export type FunctionName<DB> =
	| keyof FunctionCatalog
	| keyof SchemaFunctions<DB>
	| keyof PgFunctions;

export type LookupFn<
	DB,
	Name extends string,
> = Name extends keyof FunctionCatalog
	? FunctionCatalog[Name]
	: Name extends keyof SchemaFunctions<DB>
		? SchemaFunctions<DB>[Name]
		: Name extends keyof PgFunctions
			? PgFunctions[Name]
			: null;

type UnknownFunction<
	Name extends string,
	As extends readonly ColInfo[],
> = SqlError<
	`function ${Name}(${ArgList<As, "", false>}) does not exist. Declare it in the schema's $functions or in FunctionCatalog`,
	null
>;
type ArgList<
	As extends readonly ColInfo[],
	Acc extends string,
	Shown extends boolean,
> = As extends readonly [
	infer A extends ColInfo,
	...infer R extends readonly ColInfo[],
]
	? ArgList<
			R,
			`${Acc}${Acc extends "" ? "" : ", "}${A["type"] extends "lit" | "null" ? "unknown" : Shown extends true ? TypeDisplay<A["type"]> : A["type"]}`,
			Shown
		>
	: Acc;

export type CallType<
	Name extends string,
	As extends readonly ColInfo[],
	C extends CallCtx,
	DB = {},
> =
	LookupFn<DB, Name> extends null
		? UnknownFunction<Name, As>
		: PickSig<LookupFn<DB, Name>, As> extends infer S extends AnySig
			? CallMisuse<Name, S, As, C> extends infer M extends string
				? SqlError<M, null>
				: [C["untypedFirst"], S["poly"]] extends [true, true]
					? SqlError<
							"could not determine polymorphic type because input has type unknown",
							null
						>
					: S["ret"] extends "$common"
						? CommonOf<As> extends string
							? CallInfo<S, As, C>
							: UnmatchedErr<Uppercase<Name>, CommonOf<As>>
						: CallInfo<S, As, C>
			: SqlError<
					`function ${Name}(${ArgList<As, "", true>}) does not exist`,
					null
				>;

type CallMisuse<
	Name extends string,
	S extends AnySig,
	As extends readonly ColInfo[],
	C extends CallCtx,
> = S["agg"] extends true
	? C["withinGroup"] extends true
		? AggMisuse<Name, As, C>
		: S["ret"] extends "$wg" | "$wgarr" | "$pct" | "$pctarr"
			? `function ${Name}(${ArgList<As, "", true>}) does not exist`
			: S["hypothetical"] extends true
				? `WITHIN GROUP is required for ordered-set aggregate ${Name}`
				: AggMisuse<Name, As, C>
	: S["window"] extends true
		? C["over"] extends true
			? C["distinct"] extends true
				? "DISTINCT is not implemented for window functions"
				: C["filter"] extends true
					? "FILTER is not implemented for non-aggregate window functions"
					: null
			: `window function ${Name} requires an OVER clause`
		: C["hasStar"] extends true
			? `${Name}(*) specified, but ${Name} is not an aggregate function`
			: C["distinct"] extends true
				? `DISTINCT specified, but ${Name} is not an aggregate function`
				: C["filter"] extends true
					? `FILTER specified, but ${Name} is not an aggregate function`
					: C["over"] extends true
						? `OVER specified, but ${Name} is not a window function nor an aggregate function`
						: null;
type AggMisuse<
	Name extends string,
	As extends readonly ColInfo[],
	C extends CallCtx,
> = As extends readonly []
	? C["hasStar"] extends true
		? null
		: C["withinGroup"] extends true
			? null
			: `${Name}(*) must be used to call a parameterless aggregate function`
	: C["over"] extends true
		? C["distinct"] extends true
			? "DISTINCT is not implemented for window functions"
			: null
		: null;

export type SrfType<
	Name extends string,
	As extends readonly ColInfo[],
	DB = {},
> =
	PickSig<LookupFn<DB, Name>, As> extends infer S extends AnySig & {
		readonly srf: true;
	}
		? ArrInfo<
				Ret<S["ret"], As, { readonly wg: "unknown" }>,
				S["nullable"] extends true
					? true
					: AnyNullable<As> extends true
						? true
						: ElemRetNull<S, As>,
				RetElemsNull<S, As>
			>
		: null;
