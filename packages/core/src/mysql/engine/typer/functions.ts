import type { GE, Tup } from "../types.js";

/**
 * A built-in function: argument counts, how its result type is found and
 * when it can be `NULL`.
 *
 * Result rules besides plain type names: `bool` and `intf` are `bigint` on
 * MySQL and `int` on MariaDB (as the servers report them); `str` is `varchar`,
 * or `varbinary` when an argument is a binary string; `arg0`/`arg1` copy an
 * argument's type; `common` aggregates all arguments' types, `iif` those
 * after the first; the others are computed in typeof.ts.
 *
 * Nullability rules: `never`; `args` when an argument can be `NULL`; `arg0`;
 * `always`; `all` when every argument can be; `iif` when a result branch can
 * be; `agg` for aggregates (`NULL` over no rows); `temporal` like `args` for
 * date and time arguments, and `always` for others, which may not parse.
 */
type F<
	Min extends number,
	Max extends number,
	Ret extends string,
	Null extends NullRule,
	Kind extends "scalar" | "agg" | "win" = "scalar",
	Only extends "mysql" | "mariadb" | "both" = "both",
> = {
	readonly min: Min;
	readonly max: Max;
	readonly ret: Ret;
	readonly null: Null;
	readonly kind: Kind;
	readonly only: Only;
};

type NullRule =
	| "never"
	| "args"
	| "arg0"
	| "always"
	| "all"
	| "iif"
	| "agg"
	| "temporal"
	| "lag";

type Many = 1000;

export interface Functions {
	// Control flow
	if: F<3, 3, "iif", "iif">;
	ifnull: F<2, 2, "common", "all">;
	nvl: F<2, 2, "common", "all", "scalar", "mariadb">;
	nullif: F<2, 2, "nullif", "always">;
	coalesce: F<1, Many, "common", "all">;
	isnull: F<1, 1, "bool", "never">;
	greatest: F<2, Many, "greatest", "args">;
	least: F<2, Many, "greatest", "args">;
	interval: F<2, Many, "int", "never">;
	any_value: F<1, 1, "arg0", "arg0", "scalar", "mysql">;
	name_const: F<2, 2, "arg1", "arg0">;
	default: F<1, 1, "arg0", "arg0">;
	values: F<1, 1, "arg0", "always">;
	value: F<1, 1, "arg0", "always", "scalar", "mariadb">;

	// Strings
	ascii: F<1, 1, "int", "args">;
	bin: F<1, 1, "varchar", "args">;
	bit_length: F<1, 1, "bigint", "args">;
	char: F<1, Many, "varbinary", "never">;
	char_length: F<1, 1, "intf", "args">;
	character_length: F<1, 1, "intf", "args">;
	chr: F<1, 1, "varchar", "args", "scalar", "mariadb">;
	concat: F<1, Many, "str", "args">;
	concat_ws: F<2, Many, "str", "arg0">;
	elt: F<2, Many, "str", "always">;
	export_set: F<3, 5, "varchar", "args">;
	field: F<1, Many, "int", "never">;
	find_in_set: F<2, 2, "int", "args">;
	format: F<2, 3, "varchar", "args">;
	from_base64: F<1, 1, "varbinary", "always">;
	hex: F<1, 1, "varchar", "args">;
	insert: F<4, 4, "str", "args">;
	instr: F<2, 2, "int", "args">;
	lcase: F<1, 1, "str", "args">;
	left: F<2, 2, "str", "args">;
	length: F<1, 1, "intf", "args">;
	length2: F<1, 1, "intf", "args", "scalar", "mariadb">;
	octet_length: F<1, 1, "intf", "args">;
	locate: F<2, 3, "int", "args">;
	lower: F<1, 1, "str", "args">;
	lpad: F<2, 3, "str", "args">;
	ltrim: F<1, 1, "str", "args">;
	make_set: F<2, Many, "varchar", "arg0">;
	mid: F<2, 3, "str", "args">;
	oct: F<1, 1, "varchar", "args">;
	ord: F<1, 1, "intf", "args">;
	position: F<2, 2, "int", "args">;
	quote: F<1, 1, "varchar", "never">;
	regexp_instr: F<2, 6, "int", "args">;
	regexp_like: F<2, 3, "bool", "args", "scalar", "mysql">;
	regexp_replace: F<3, 6, "str", "args">;
	regexp_substr: F<2, 5, "str", "always">;
	repeat: F<2, 2, "str", "args">;
	replace: F<3, 3, "str", "args">;
	reverse: F<1, 1, "str", "args">;
	right: F<2, 2, "str", "args">;
	rpad: F<2, 3, "str", "args">;
	rtrim: F<1, 1, "str", "args">;
	soundex: F<1, 1, "varchar", "args">;
	space: F<1, 1, "varchar", "args">;
	strcmp: F<2, 2, "int", "args">;
	substr: F<2, 3, "str", "args">;
	substring: F<2, 3, "str", "args">;
	substring_index: F<3, 3, "str", "args">;
	to_base64: F<1, 1, "varchar", "args">;
	trim: F<1, 2, "str", "args">;
	ucase: F<1, 1, "str", "args">;
	unhex: F<1, 1, "varbinary", "always">;
	upper: F<1, 1, "str", "args">;
	weight_string: F<1, 1, "varbinary", "args">;
	sformat: F<1, Many, "varchar", "args", "scalar", "mariadb">;
	natural_sort_key: F<1, 1, "varchar", "args", "scalar", "mariadb">;
	soundslike: F<2, 2, "bool", "args">;

	// Hashing, encryption, identifiers
	md5: F<1, 1, "varchar", "args">;
	sha: F<1, 1, "varchar", "args">;
	sha1: F<1, 1, "varchar", "args">;
	sha2: F<2, 2, "varchar", "always">;
	crc32: F<1, 1, "int unsigned", "args">;
	crc32c: F<1, 2, "bigint unsigned", "args", "scalar", "mariadb">;
	aes_encrypt: F<2, 6, "varbinary", "always">;
	aes_decrypt: F<2, 6, "varbinary", "always">;
	compress: F<1, 1, "varbinary", "args">;
	uncompress: F<1, 1, "varbinary", "always">;
	uncompressed_length: F<1, 1, "int unsigned", "args">;
	random_bytes: F<1, 1, "varbinary", "args">;
	uuid: F<0, 0, "varchar", "never">;
	uuid_v4: F<0, 0, "uuid", "never", "scalar", "mariadb">;
	uuid_v7: F<0, 0, "uuid", "never", "scalar", "mariadb">;
	sys_guid: F<0, 0, "varchar", "never", "scalar", "mariadb">;
	uuid_short: F<0, 0, "bigint unsigned", "never">;
	uuid_to_bin: F<1, 2, "varbinary", "args", "scalar", "mysql">;
	bin_to_uuid: F<1, 2, "varchar", "args", "scalar", "mysql">;
	is_uuid: F<1, 1, "bool", "args", "scalar", "mysql">;
	inet_aton: F<1, 1, "bigint unsigned", "always">;
	inet_ntoa: F<1, 1, "varchar", "always">;
	inet6_aton: F<1, 1, "varbinary", "always">;
	inet6_ntoa: F<1, 1, "varchar", "always">;
	is_ipv4: F<1, 1, "bool", "never">;
	is_ipv6: F<1, 1, "bool", "never">;
	is_ipv4_compat: F<1, 1, "bool", "never">;
	is_ipv4_mapped: F<1, 1, "bool", "never">;

	// Numbers
	abs: F<1, 1, "abs", "args">;
	acos: F<1, 1, "double", "always">;
	asin: F<1, 1, "double", "always">;
	atan: F<1, 2, "double", "args">;
	atan2: F<2, 2, "double", "args">;
	ceil: F<1, 1, "ceil", "args">;
	ceiling: F<1, 1, "ceil", "args">;
	conv: F<3, 3, "varchar", "always">;
	cos: F<1, 1, "double", "args">;
	cot: F<1, 1, "double", "always">;
	degrees: F<1, 1, "double", "args">;
	exp: F<1, 1, "double", "args">;
	floor: F<1, 1, "ceil", "args">;
	ln: F<1, 1, "double", "always">;
	log: F<1, 2, "double", "always">;
	log10: F<1, 1, "double", "always">;
	log2: F<1, 1, "double", "always">;
	mod: F<2, 2, "mod", "always">;
	pi: F<0, 0, "double", "never">;
	pow: F<2, 2, "double", "args">;
	power: F<2, 2, "double", "args">;
	radians: F<1, 1, "double", "args">;
	rand: F<0, 1, "double", "never">;
	round: F<1, 2, "round", "args">;
	sign: F<1, 1, "int", "args">;
	sin: F<1, 1, "double", "args">;
	sqrt: F<1, 1, "double", "always">;
	tan: F<1, 1, "double", "args">;
	truncate: F<2, 2, "round", "args">;

	// Dates and times
	adddate: F<2, 2, "dateadd", "always">;
	date_add: F<2, 2, "dateadd", "always">;
	subdate: F<2, 2, "dateadd", "always">;
	date_sub: F<2, 2, "dateadd", "always">;
	addtime: F<2, 2, "addtime", "always">;
	subtime: F<2, 2, "addtime", "always">;
	convert_tz: F<3, 3, "datetime", "always">;
	curdate: F<0, 0, "date", "never">;
	current_date: F<0, 0, "date", "never">;
	curtime: F<0, 1, "time", "never">;
	current_time: F<0, 1, "time", "never">;
	now: F<0, 1, "now", "never">;
	current_timestamp: F<0, 1, "now", "never">;
	localtime: F<0, 1, "now", "never">;
	localtimestamp: F<0, 1, "now", "never">;
	sysdate: F<0, 1, "now", "never">;
	utc_date: F<0, 0, "date", "never">;
	utc_time: F<0, 1, "time", "never">;
	utc_timestamp: F<0, 1, "datetime", "never">;
	date: F<1, 1, "date", "temporal">;
	datediff: F<2, 2, "intf", "temporal">;
	date_format: F<2, 3, "varchar", "temporal">;
	day: F<1, 1, "int", "temporal">;
	dayofmonth: F<1, 1, "int", "temporal">;
	dayname: F<1, 1, "varchar", "temporal">;
	dayofweek: F<1, 1, "int", "temporal">;
	dayofyear: F<1, 1, "int", "temporal">;
	extract: F<2, 2, "int", "temporal">;
	from_days: F<1, 1, "date", "args">;
	from_unixtime: F<1, 2, "fromunix", "always">;
	get_format: F<2, 2, "varchar", "always">;
	hour: F<1, 1, "int", "temporal">;
	last_day: F<1, 1, "date", "always">;
	makedate: F<2, 2, "date", "always">;
	maketime: F<3, 3, "time", "always">;
	microsecond: F<1, 1, "int", "temporal">;
	minute: F<1, 1, "int", "temporal">;
	month: F<1, 1, "int", "temporal">;
	monthname: F<1, 1, "varchar", "temporal">;
	period_add: F<2, 2, "int", "args">;
	period_diff: F<2, 2, "int", "args">;
	quarter: F<1, 1, "int", "temporal">;
	second: F<1, 1, "int", "temporal">;
	sec_to_time: F<1, 1, "time", "args">;
	str_to_date: F<2, 2, "strtodate", "always">;
	time: F<1, 1, "time", "temporal">;
	timediff: F<2, 2, "time", "always">;
	time_format: F<2, 2, "varchar", "temporal">;
	time_to_sec: F<1, 1, "bigint", "temporal">;
	timestamp: F<1, 2, "datetime", "temporal">;
	timestampadd: F<3, 3, "datetime", "always">;
	timestampdiff: F<3, 3, "bigint", "temporal">;
	to_days: F<1, 1, "intf", "temporal">;
	to_seconds: F<1, 1, "bigint", "temporal">;
	unix_timestamp: F<0, 1, "unixts", "temporal">;
	week: F<1, 2, "int", "temporal">;
	weekday: F<1, 1, "int", "temporal">;
	weekofyear: F<1, 1, "int", "temporal">;
	year: F<1, 1, "int", "temporal">;
	yearweek: F<1, 2, "int", "temporal">;

	// JSON
	json_array: F<0, Many, "json", "never">;
	json_array_append: F<3, Many, "json", "args">;
	json_array_insert: F<3, Many, "json", "args">;
	json_contains: F<2, 3, "bool", "args">;
	json_contains_path: F<3, Many, "bool", "args">;
	json_depth: F<1, 1, "int", "args">;
	json_extract: F<2, Many, "jsonext", "always">;
	json_insert: F<3, Many, "json", "args">;
	json_keys: F<1, 2, "json", "always">;
	json_length: F<1, 2, "int", "always">;
	json_merge: F<2, Many, "json", "args">;
	json_merge_patch: F<2, Many, "json", "args">;
	json_merge_preserve: F<2, Many, "json", "args">;
	json_object: F<0, Many, "json", "never">;
	json_overlaps: F<2, 2, "bool", "args">;
	json_pretty: F<1, 1, "longtext", "args">;
	json_quote: F<1, 1, "varchar", "args">;
	json_remove: F<2, Many, "json", "args">;
	json_replace: F<3, Many, "json", "args">;
	json_schema_valid: F<2, 2, "bool", "args">;
	json_schema_validation_report: F<2, 2, "json", "args">;
	json_search: F<3, Many, "json", "always">;
	json_set: F<3, Many, "json", "args">;
	json_storage_free: F<1, 1, "int", "args">;
	json_storage_size: F<1, 1, "int", "args">;
	json_type: F<1, 1, "varchar", "args">;
	json_unquote: F<1, 1, "jsonunquote", "args">;
	json_valid: F<1, 1, "bool", "args">;
	json_value: F<2, 2, "jsonvalue", "always">;
	json_compact: F<1, 1, "json", "args", "scalar", "mariadb">;
	json_detailed: F<1, 2, "json", "args", "scalar", "mariadb">;
	json_loose: F<1, 1, "json", "args", "scalar", "mariadb">;
	json_exists: F<2, 2, "bool", "args", "scalar", "mariadb">;
	json_query: F<2, 2, "json", "always", "scalar", "mariadb">;
	json_normalize: F<1, 1, "json", "args", "scalar", "mariadb">;
	json_equals: F<2, 2, "bool", "args", "scalar", "mariadb">;
	json_array_intersect: F<2, 2, "json", "always", "scalar", "mariadb">;
	json_object_filter_keys: F<2, 2, "json", "always", "scalar", "mariadb">;
	json_object_to_array: F<1, 1, "json", "args", "scalar", "mariadb">;
	json_key_value: F<2, 2, "json", "always", "scalar", "mariadb">;

	// Aggregates
	count: F<1, Many, "bigint", "never", "agg">;
	sum: F<1, 1, "sum", "agg", "agg">;
	avg: F<1, 1, "avg", "agg", "agg">;
	min: F<1, 1, "arg0", "agg", "agg">;
	max: F<1, 1, "arg0", "agg", "agg">;
	group_concat: F<1, Many, "text", "agg", "agg">;
	bit_and: F<1, 1, "bigint unsigned", "never", "agg">;
	bit_or: F<1, 1, "bigint unsigned", "never", "agg">;
	bit_xor: F<1, 1, "bigint unsigned", "never", "agg">;
	std: F<1, 1, "double", "agg", "agg">;
	stddev: F<1, 1, "double", "agg", "agg">;
	stddev_pop: F<1, 1, "double", "agg", "agg">;
	stddev_samp: F<1, 1, "double", "agg", "agg">;
	variance: F<1, 1, "double", "agg", "agg">;
	var_pop: F<1, 1, "double", "agg", "agg">;
	var_samp: F<1, 1, "double", "agg", "agg">;
	json_arrayagg: F<1, 1, "json", "agg", "agg">;
	json_objectagg: F<2, 2, "json", "agg", "agg">;
	grouping: F<1, Many, "int", "never", "agg">;

	// Window functions
	row_number: F<0, 0, "bigint unsigned", "never", "win">;
	rank: F<0, 0, "bigint unsigned", "never", "win">;
	dense_rank: F<0, 0, "bigint unsigned", "never", "win">;
	percent_rank: F<0, 0, "double", "never", "win">;
	cume_dist: F<0, 0, "double", "never", "win">;
	ntile: F<1, 1, "bigint unsigned", "args", "win">;
	lag: F<1, 3, "lag", "lag", "win">;
	lead: F<1, 3, "lag", "lag", "win">;
	first_value: F<1, 1, "arg0", "always", "win">;
	last_value: F<1, 1, "arg0", "always", "win">;
	nth_value: F<2, 2, "arg0", "always", "win">;

	// Information and miscellaneous
	benchmark: F<2, 2, "int", "never">;
	charset: F<1, 1, "varchar", "never">;
	coercibility: F<1, 1, "int", "never">;
	collation: F<1, 1, "varchar", "never">;
	connection_id: F<0, 0, "uintf", "never">;
	current_user: F<0, 0, "varchar", "never">;
	current_role: F<0, 0, "varchar", "always">;
	database: F<0, 0, "varchar", "always">;
	schema: F<0, 0, "varchar", "always">;
	found_rows: F<0, 0, "bigint", "never">;
	last_insert_id: F<0, 1, "bigint unsigned", "never">;
	row_count: F<0, 0, "bigint", "never">;
	session_user: F<0, 0, "varchar", "never">;
	system_user: F<0, 0, "varchar", "never">;
	user: F<0, 0, "varchar", "never">;
	version: F<0, 0, "varchar", "never">;
	sleep: F<1, 1, "int", "never">;
	get_lock: F<2, 2, "int", "always">;
	release_lock: F<1, 1, "int", "always">;
	release_all_locks: F<0, 0, "int", "never">;
	is_free_lock: F<1, 1, "int", "always">;
	is_used_lock: F<1, 1, "bigint unsigned", "always">;
	format_bytes: F<1, 1, "varchar", "args">;
	format_pico_time: F<1, 1, "varchar", "args">;
	inet4_aton: F<1, 1, "bigint unsigned", "always", "scalar", "mariadb">;
	nextval: F<1, 1, "bigint", "never", "scalar", "mariadb">;
	lastval: F<1, 1, "bigint", "always", "scalar", "mariadb">;
	setval: F<2, 4, "bigint", "always", "scalar", "mariadb">;

	// Spatial
	point: F<2, 2, "point", "args">;
	st_geomfromtext: F<1, 3, "geometry", "always">;
	st_geometryfromtext: F<1, 3, "geometry", "always">;
	st_geomfromwkb: F<1, 3, "geometry", "always">;
	st_geomfromgeojson: F<1, 4, "geometry", "always">;
	st_pointfromtext: F<1, 3, "point", "always">;
	st_srid: F<1, 2, "int", "args">;
	st_astext: F<1, 2, "longtext", "args">;
	st_aswkt: F<1, 2, "longtext", "args">;
	st_asbinary: F<1, 2, "longblob", "args">;
	st_aswkb: F<1, 2, "longblob", "args">;
	st_asgeojson: F<1, 3, "json", "args">;
	st_x: F<1, 2, "double", "args">;
	st_y: F<1, 2, "double", "args">;
	st_latitude: F<1, 2, "double", "args", "scalar", "mysql">;
	st_longitude: F<1, 2, "double", "args", "scalar", "mysql">;
	st_distance: F<2, 3, "double", "args">;
	st_distance_sphere: F<2, 3, "double", "args">;
	st_area: F<1, 1, "double", "args">;
	st_length: F<1, 2, "double", "args">;
	st_contains: F<2, 2, "bool", "args">;
	st_within: F<2, 2, "bool", "args">;
	st_intersects: F<2, 2, "bool", "args">;
	st_equals: F<2, 2, "bool", "args">;
	st_touches: F<2, 2, "bool", "args">;
	st_isvalid: F<1, 1, "bool", "args">;
	st_isempty: F<1, 1, "bool", "args">;
	st_geometrytype: F<1, 1, "varchar", "args">;
	st_buffer: F<2, 5, "geometry", "args">;
	st_centroid: F<1, 1, "geometry", "args">;
	st_envelope: F<1, 1, "geometry", "args">;
	st_union: F<2, 2, "geometry", "args">;
	st_intersection: F<2, 2, "geometry", "args">;
	st_difference: F<2, 2, "geometry", "args">;
	st_makeenvelope: F<2, 2, "geometry", "args">;
	st_numpoints: F<1, 1, "int", "args">;
	st_startpoint: F<1, 1, "point", "args">;
	st_endpoint: F<1, 1, "point", "args">;

	// Vectors
	vector_dim: F<1, 1, "int", "args", "scalar", "mysql">;
	vector_to_string: F<1, 1, "varchar", "args">;
	string_to_vector: F<1, 1, "vector", "args", "scalar", "mysql">;
	vec_fromtext: F<1, 1, "vector", "args", "scalar", "mariadb">;
	vec_totext: F<1, 1, "varchar", "args", "scalar", "mariadb">;
	vec_distance: F<2, 2, "double", "args", "scalar", "mariadb">;
	vec_distance_euclidean: F<2, 2, "double", "args", "scalar", "mariadb">;
	vec_distance_cosine: F<2, 2, "double", "args", "scalar", "mariadb">;
	distance: F<2, 3, "double", "args", "scalar", "mysql">;
}

export type Fn = {
	readonly min: number;
	readonly max: number;
	readonly ret: string;
	readonly null: NullRule;
	readonly kind: "scalar" | "agg" | "win";
	readonly only: "mysql" | "mariadb" | "both";
};

export type IsAggCall<E, DB> = E extends {
	readonly t: "call";
	readonly name: infer N extends string;
	readonly over: null;
	readonly args: readonly unknown[];
}
	? DeclaredFn<DB, N> extends infer D
		? D extends null
			? N extends keyof Functions
				? Functions[N]["kind"] extends "agg"
					? true
					: false
				: false
			: PickSig<D, E["args"]["length"]> extends { readonly agg: true }
				? true
				: false
		: never
	: false;

// biome-ignore lint/suspicious/noEmptyInterface: augmented with `declare module` to add stored functions or UDFs to every schema.
export interface FunctionCatalog {}

export type SigFlags = {
	readonly nullable?: boolean;
	readonly agg?: boolean;
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
	? GE<N, Required_<A>>
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
			readonly kind: S["agg"] extends true ? "agg" : "scalar";
			readonly only: "both";
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
