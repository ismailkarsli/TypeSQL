export type TypeAliases = {
	int: "int4";
	integer: "int4";
	int4: "int4";
	serial: "int4";
	serial4: "int4";
	smallint: "int2";
	int2: "int2";
	smallserial: "int2";
	serial2: "int2";
	bigint: "int8";
	int8: "int8";
	bigserial: "int8";
	serial8: "int8";
	real: "float4";
	float4: "float4";
	"double precision": "float8";
	float8: "float8";
	float: "float8";
	numeric: "numeric";
	decimal: "numeric";
	dec: "numeric";
	boolean: "bool";
	bool: "bool";
	text: "text";
	citext: "text";
	"character varying": "varchar";
	varchar: "varchar";
	character: "bpchar";
	char: "bpchar";
	bpchar: "bpchar";
	name: "name";
	bytea: "bytea";
	date: "date";
	time: "time";
	"time without time zone": "time";
	timetz: "timetz";
	"time with time zone": "timetz";
	timestamp: "timestamp";
	"timestamp without time zone": "timestamp";
	timestamptz: "timestamptz";
	"timestamp with time zone": "timestamptz";
	interval: "interval";
	uuid: "uuid";
	json: "json";
	jsonb: "jsonb";
	xml: "xml";
	money: "money";
	inet: "inet";
	cidr: "cidr";
	macaddr: "macaddr";
	macaddr8: "macaddr8";
	bit: "bit";
	"bit varying": "varbit";
	varbit: "varbit";
	oid: "oid";
	regclass: "regclass";
	regtype: "regtype";
	regproc: "regproc";
	point: "point";
	line: "line";
	lseg: "lseg";
	box: "box";
	path: "path";
	polygon: "polygon";
	circle: "circle";
	tsvector: "tsvector";
	tsquery: "tsquery";
	int4range: "int4range";
	int8range: "int8range";
	numrange: "numrange";
	tsrange: "tsrange";
	tstzrange: "tstzrange";
	daterange: "daterange";
	record: "record";
	void: "void";
	unknown: "unknown";
};

export type NormalizeTypeName<S extends string> = S extends `${infer E}[]`
	? `${NormalizeTypeName<E>}[]`
	: S extends keyof TypeAliases
		? TypeAliases[S]
		: S;

export type SerialTypeName =
	| "serial"
	| "serial4"
	| "smallserial"
	| "serial2"
	| "bigserial"
	| "serial8";

/** Type spellings that differ from the canonical name (`integer`, `bool`, …). */
type AliasSpelling = {
	[K in keyof TypeAliases]: K extends TypeAliases[K] ? never : K;
}[keyof TypeAliases];

type IsAlias<T> = T extends string
	? string extends T
		? false
		: T extends AliasSpelling | `${AliasSpelling}[]` | `${AliasSpelling}[][]`
			? true
			: false
	: false;

type SkippedKey = `$${string}` | "pg_catalog" | "information_schema";

type IsRelation<R> = R extends { readonly $view: unknown }
	? true
	: [keyof R] extends [never]
		? true
		: R[keyof R] extends { readonly type: unknown }
			? true
			: false;

type ColsHaveAlias<R> = true extends {
	[C in keyof R]: R[C] extends { readonly type: infer T } ? IsAlias<T> : false;
}[keyof R]
	? true
	: false;

type EntryHasAlias<R> = R extends { readonly $view: infer V }
	? ColsHaveAlias<V>
	: IsRelation<R> extends true
		? ColsHaveAlias<R>
		: true extends { [T in keyof R]: EntryHasAlias<R[T]> }[keyof R]
			? true
			: false;

type NormCol<C> = C extends { readonly type: infer T }
	? IsAlias<T> extends true
		? {
				readonly [P in keyof C]: P extends "type"
					? NormalizeTypeName<T & string>
					: C[P];
			}
		: C
	: C;
type NormCols<R> = { [C in keyof R]: NormCol<R[C]> };
type NormEntry<R> = R extends { readonly $view: infer V }
	? { readonly $view: NormCols<V> }
	: IsRelation<R> extends true
		? NormCols<R>
		: { [T in keyof R]: NormEntry<R[T]> };

/**
 * A hand-written schema may spell column types as in SQL (`Col<"integer">`,
 * `Col<"timestamp with time zone">`). Rewrite them to the canonical names the
 * engine and type maps use; a schema without such spellings is returned as is.
 */
export type NormalizeSchema<DB> = true extends {
	[K in keyof DB]: K extends SkippedKey ? false : EntryHasAlias<DB[K]>;
}[keyof DB]
	? {
			[K in keyof DB]: K extends SkippedKey ? DB[K] : NormEntry<DB[K]>;
		}
	: DB;
