/**
 * Canonical Postgres type names used inside the engine. Everything the user or the
 * SQL text spells (`integer`, `bigint`, `timestamp with time zone`, `serial`, ...) is
 * normalized to one of these (or `${T}[]` for arrays, or a user enum name).
 */
export type PgScalarName =
	| "bool"
	| "int2"
	| "int4"
	| "int8"
	| "float4"
	| "float8"
	| "numeric"
	| "money"
	| "text"
	| "varchar"
	| "bpchar"
	| "char"
	| "name"
	| "bytea"
	| "date"
	| "time"
	| "timetz"
	| "timestamp"
	| "timestamptz"
	| "interval"
	| "uuid"
	| "json"
	| "jsonb"
	| "xml"
	| "inet"
	| "cidr"
	| "macaddr"
	| "macaddr8"
	| "bit"
	| "varbit"
	| "oid"
	| "regclass"
	| "regtype"
	| "regproc"
	| "point"
	| "line"
	| "lseg"
	| "box"
	| "path"
	| "polygon"
	| "circle"
	| "tsvector"
	| "tsquery"
	| "int4range"
	| "int8range"
	| "numrange"
	| "tsrange"
	| "tstzrange"
	| "daterange"
	| "record"
	| "void"
	| "unknown"
	| "anyelement"
	| "anyarray"
	| "anynonarray"
	| "anyenum"
	| "anyrange";

export type PgTypeName = PgScalarName | `${string}[]` | (string & {});

/** Element type of an array type name, or never. */
export type ElemOf<T extends string> = T extends `${infer E}[]` ? E : never;
export type IsArray<T extends string> = T extends `${string}[]` ? true : false;

/** Numeric family used for operator promotion. */
export type IntType = "int2" | "int4" | "int8";
export type FloatType = "float4" | "float8";
export type NumericType = IntType | FloatType | "numeric";
export type StringType = "text" | "varchar" | "bpchar" | "char" | "name";
export type DateTimeType =
	| "date"
	| "time"
	| "timetz"
	| "timestamp"
	| "timestamptz";
export type JsonType = "json" | "jsonb";
