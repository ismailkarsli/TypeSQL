export type IntT = "int2" | "int4" | "int8";
export type FloatT = "float4" | "float8";
export type NumT = IntT | FloatT | "numeric";
export type StrT = "text" | "varchar" | "bpchar" | "char" | "name";
export type JsonT = "json" | "jsonb";
export type TsT = "timestamp" | "timestamptz";
export type TimeT = "time" | "timetz";
export type DateTimeT = "date" | TimeT | TsT;
export type BitT = "bit" | "varbit";
export type RangeT = `${string}range`;
type RegT = "regclass" | "regtype" | "regproc" | "regconfig";

/**
 * What PostgreSQL's catalog says about each type the engine knows, read by
 * indexed access (`TypeFact<T, "name">`):
 * - `name`: how format_type spells it in PostgreSQL's messages;
 * - `from`: the types of its category (pg_type.typcategory) that convert to
 *   it implicitly (pg_cast), which is how a common type is found;
 * - `cat`: a category no other category converts to, so two values of
 *   different categories have no comparison operator;
 * - `sub`: what a subscript returns, or false where PostgreSQL rejects one;
 * - `eq: false`: no equality operator for hashing or sorting (CYCLE marks);
 * - `json`: the JSON value to_json gives for it.
 * `lit` and `null` are the engine's untyped literal and NULL.
 */
export interface PgTypeFacts {
	bool: {
		cat: "boolean";
		name: "boolean";
		sub: false;
		json: "boolean";
	};
	int2: {
		cat: "numeric";
		name: "smallint";
		sub: false;
		json: "number";
	};
	int4: {
		cat: "numeric";
		name: "integer";
		from: "int2";
		sub: false;
		json: "number";
	};
	int8: {
		cat: "numeric";
		name: "bigint";
		from: "int2" | "int4";
		sub: false;
		json: "number";
	};
	float4: {
		cat: "numeric";
		name: "real";
		from: IntT | "numeric";
		sub: false;
		json: "number";
	};
	float8: {
		cat: "numeric";
		name: "double precision";
		from: IntT | "numeric" | "float4";
		sub: false;
		json: "number";
	};
	numeric: {
		cat: "numeric";
		from: IntT;
		sub: false;
		json: "number";
	};
	money: { sub: false; json: "string" };
	oid: { from: IntT | RegT; sub: false; json: "string" };
	regclass: { from: IntT | "oid"; sub: false; json: "string" };
	regtype: { from: IntT | "oid"; sub: false; json: "string" };
	regproc: { from: IntT | "oid"; sub: false; json: "string" };
	regconfig: { from: IntT | "oid"; json: "string" };
	text: {
		cat: "string";
		from: "varchar" | "bpchar" | "name";
		sub: false;
		json: "string";
	};
	varchar: {
		cat: "string";
		name: "character varying";
		from: "text" | "bpchar";
		sub: false;
		json: "string";
	};
	bpchar: {
		cat: "string";
		name: "character";
		from: "text" | "varchar";
		sub: false;
		json: "string";
	};
	char: { cat: "string"; name: '"char"'; sub: false; json: "string" };
	name: {
		cat: "string";
		from: "text" | "varchar" | "bpchar";
		sub: "char";
		json: "string";
	};
	bytea: { cat: "bytea"; sub: false; json: "string" };
	date: { cat: "datetime"; sub: false; json: "string" };
	time: {
		cat: "datetime";
		name: "time without time zone";
		sub: false;
		json: "string";
	};
	timetz: {
		cat: "datetime";
		name: "time with time zone";
		from: "time";
		sub: false;
		json: "string";
	};
	timestamp: {
		cat: "datetime";
		name: "timestamp without time zone";
		from: "date";
		sub: false;
		json: "string";
	};
	timestamptz: {
		cat: "datetime";
		name: "timestamp with time zone";
		from: "date" | "timestamp";
		sub: false;
		json: "string";
	};
	interval: { cat: "timespan"; sub: false; json: "string" };
	uuid: { cat: "uuid"; sub: false; json: "string" };
	json: { sub: false; eq: false };
	jsonb: { sub: "jsonb" };
	jsonpath: { eq: false; json: "string" };
	xml: { sub: false; eq: false; json: "string" };
	inet: { from: "cidr"; sub: false; json: "string" };
	cidr: { sub: false; json: "string" };
	macaddr: { from: "macaddr8"; sub: false; json: "string" };
	macaddr8: { from: "macaddr"; sub: false; json: "string" };
	bit: { from: "varbit"; sub: false; json: "string" };
	varbit: {
		name: "bit varying";
		from: "bit";
		sub: false;
		json: "string";
	};
	point: { sub: "float8"; eq: false; json: "string" };
	line: { sub: "float8"; eq: false; json: "string" };
	lseg: { sub: "point"; eq: false; json: "string" };
	box: { sub: "point"; eq: false; json: "string" };
	path: { sub: false; eq: false; json: "string" };
	polygon: { sub: false; eq: false; json: "string" };
	circle: { sub: false; eq: false; json: "string" };
	tsvector: { sub: false; json: "string" };
	tsquery: { sub: false; json: "string" };
	int4range: { sub: false };
	int8range: { sub: false };
	numrange: { sub: false };
	tsrange: { sub: false };
	tstzrange: { sub: false };
	daterange: { sub: false };
	pg_snapshot: { eq: false };
	txid_snapshot: { eq: false };
	refcursor: { eq: false };
	lit: { name: "text" };
	null: { name: "unknown" };
}

type Facts = {
	readonly name?: string;
	readonly cat?: string;
	readonly from?: string;
	readonly sub?: string | false;
	readonly eq?: false;
	readonly json?: string;
};

/** A fact about type T, or `D` when the table has none. */
export type TypeFact<
	T extends string,
	K extends keyof Facts,
	D = null,
> = T extends keyof PgTypeFacts
	? PgTypeFacts[T] extends { readonly [P in K]: infer V }
		? V
		: D
	: D;

/** The serial pseudo-types: a column of the integer type with a sequence default. */
export interface SerialAliases {
	serial: "int4";
	serial4: "int4";
	smallserial: "int2";
	serial2: "int2";
	bigserial: "int8";
	serial8: "int8";
}

/** Other spellings of types in SQL and schemas, with their canonical names. */
export interface TypeAliases extends SerialAliases {
	int: "int4";
	integer: "int4";
	smallint: "int2";
	bigint: "int8";
	real: "float4";
	"double precision": "float8";
	float: "float8";
	decimal: "numeric";
	dec: "numeric";
	boolean: "bool";
	citext: "text";
	"character varying": "varchar";
	character: "bpchar";
	"time without time zone": "time";
	"time with time zone": "timetz";
	"timestamp without time zone": "timestamp";
	"timestamp with time zone": "timestamptz";
	"bit varying": "varbit";
}

/** The types in the table, as opposed to arrays, records and unknown types. */
export type KnownType = Exclude<keyof PgTypeFacts, "lit" | "null">;
