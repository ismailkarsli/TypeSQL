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
