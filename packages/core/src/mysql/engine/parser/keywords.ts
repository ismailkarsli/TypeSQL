/**
 * Words both MySQL and MariaDB reserve. Words only one of them reserves (such
 * as MySQL's `rank`, `rows` and `window`) are accepted as names, so a statement
 * valid on either server parses.
 */
export const RESERVED = [
	"add",
	"all",
	"alter",
	"analyze",
	"and",
	"as",
	"asc",
	"asensitive",
	"before",
	"between",
	"bigint",
	"binary",
	"blob",
	"both",
	"by",
	"call",
	"cascade",
	"case",
	"change",
	"char",
	"character",
	"check",
	"collate",
	"column",
	"condition",
	"constraint",
	"continue",
	"convert",
	"create",
	"cross",
	"current_date",
	"current_time",
	"current_timestamp",
	"current_user",
	"cursor",
	"database",
	"databases",
	"day_hour",
	"day_microsecond",
	"day_minute",
	"day_second",
	"dec",
	"decimal",
	"declare",
	"default",
	"delayed",
	"delete",
	"desc",
	"describe",
	"deterministic",
	"distinct",
	"distinctrow",
	"div",
	"double",
	"drop",
	"dual",
	"each",
	"else",
	"elseif",
	"enclosed",
	"escaped",
	"except",
	"exists",
	"exit",
	"explain",
	"false",
	"fetch",
	"float",
	"float4",
	"float8",
	"for",
	"force",
	"foreign",
	"from",
	"fulltext",
	"grant",
	"group",
	"having",
	"high_priority",
	"hour_microsecond",
	"hour_minute",
	"hour_second",
	"if",
	"ignore",
	"in",
	"index",
	"infile",
	"inner",
	"inout",
	"insensitive",
	"insert",
	"int",
	"int1",
	"int2",
	"int3",
	"int4",
	"int8",
	"integer",
	"intersect",
	"interval",
	"into",
	"is",
	"iterate",
	"join",
	"key",
	"keys",
	"kill",
	"leading",
	"leave",
	"left",
	"like",
	"limit",
	"linear",
	"lines",
	"load",
	"localtime",
	"localtimestamp",
	"lock",
	"long",
	"longblob",
	"longtext",
	"loop",
	"low_priority",
	"match",
	"maxvalue",
	"mediumblob",
	"mediumint",
	"mediumtext",
	"middleint",
	"minute_microsecond",
	"minute_second",
	"mod",
	"modifies",
	"natural",
	"not",
	"no_write_to_binlog",
	"null",
	"numeric",
	"on",
	"optimize",
	"option",
	"optionally",
	"or",
	"order",
	"out",
	"outer",
	"outfile",
	"partition",
	"precision",
	"primary",
	"procedure",
	"purge",
	"range",
	"read",
	"reads",
	"read_write",
	"real",
	"recursive",
	"references",
	"regexp",
	"release",
	"rename",
	"repeat",
	"replace",
	"require",
	"resignal",
	"restrict",
	"return",
	"revoke",
	"right",
	"rlike",
	"schema",
	"schemas",
	"second_microsecond",
	"select",
	"sensitive",
	"separator",
	"set",
	"show",
	"signal",
	"smallint",
	"spatial",
	"specific",
	"sql",
	"sqlexception",
	"sqlstate",
	"sqlwarning",
	"sql_big_result",
	"sql_calc_found_rows",
	"sql_small_result",
	"ssl",
	"starting",
	"straight_join",
	"table",
	"terminated",
	"then",
	"tinyblob",
	"tinyint",
	"tinytext",
	"to",
	"trailing",
	"trigger",
	"true",
	"undo",
	"union",
	"unique",
	"unlock",
	"unsigned",
	"update",
	"usage",
	"use",
	"using",
	"utc_date",
	"utc_time",
	"utc_timestamp",
	"values",
	"varbinary",
	"varchar",
	"varcharacter",
	"varying",
	"when",
	"where",
	"while",
	"with",
	"write",
	"xor",
	"year_month",
	"zerofill",
] as const;
export type Reserved = (typeof RESERVED)[number];

/** Words only MySQL 8.4 or only MariaDB reserves, which the parser accepts as names. */
export const SINGLE_SERVER_RESERVED = [
	"accessible",
	"cube",
	"cume_dist",
	"current_role",
	"delete_domain_id",
	"dense_rank",
	"do_domain_ids",
	"empty",
	"first_value",
	"function",
	"general",
	"generated",
	"get",
	"grouping",
	"groups",
	"ignore_domain_ids",
	"ignore_server_ids",
	"io_after_gtids",
	"io_before_gtids",
	"json_table",
	"lag",
	"last_value",
	"lateral",
	"lead",
	"manual",
	"master_bind",
	"master_heartbeat_period",
	"master_ssl_verify_server_cert",
	"nth_value",
	"ntile",
	"of",
	"offset",
	"optimizer_costs",
	"over",
	"page_checksum",
	"parallel",
	"parse_vcol_expr",
	"percent_rank",
	"position",
	"qualify",
	"rank",
	"ref_system_id",
	"returning",
	"row",
	"row_number",
	"rows",
	"slow",
	"stats_auto_recalc",
	"stats_persistent",
	"stats_sample_pages",
	"stored",
	"system",
	"tablesample",
	"virtual",
	"window",
] as const;

/** Reserved words that can't start a function call. */
export type NoCall =
	| "all"
	| "and"
	| "as"
	| "asc"
	| "between"
	| "by"
	| "case"
	| "collate"
	| "create"
	| "cross"
	| "delete"
	| "desc"
	| "distinct"
	| "distinctrow"
	| "div"
	| "else"
	| "except"
	| "for"
	| "from"
	| "group"
	| "having"
	| "in"
	| "inner"
	| "intersect"
	| "into"
	| "is"
	| "join"
	| "like"
	| "limit"
	| "natural"
	| "not"
	| "null"
	| "on"
	| "or"
	| "order"
	| "outer"
	| "regexp"
	| "rlike"
	| "select"
	| "set"
	| "straight_join"
	| "table"
	| "then"
	| "union"
	| "update"
	| "using"
	| "when"
	| "where"
	| "with"
	| "xor";

type JoinKeyword = "cross" | "inner" | "left" | "natural" | "outer" | "right";

/** Words that end an expression, so they can't be an alias without `AS`. */
export type NotBareAlias =
	| Reserved
	| JoinKeyword
	| "returning"
	| "sounds"
	| "member"
	| "window"
	| "over"
	| "offset";

export type NotTableAlias =
	| Reserved
	| JoinKeyword
	| "returning"
	| "lateral"
	| "window"
	| "offset";
