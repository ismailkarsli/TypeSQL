import type { Decimal, JsonValue } from "@prisma/client/runtime/client";

/**
 * What `$queryRaw` returns through `@prisma/adapter-mariadb` on MySQL:
 * `INT UNSIGNED` and wider integers as bigint, `DECIMAL` as Prisma's
 * `Decimal`, `SET` as an array of its values, `BIT` and spatial values as
 * bytes, `TIME` as a `Date` on 1970-01-01 and JSON parsed.
 */
export interface PrismaMysqlTypeMap {
	tinyint: number;
	smallint: number;
	mediumint: number;
	int: number;
	bigint: bigint;
	"tinyint unsigned": number;
	"smallint unsigned": number;
	"mediumint unsigned": number;
	"int unsigned": bigint;
	"bigint unsigned": bigint;
	year: number;
	decimal: Decimal;
	float: number;
	double: number;
	bit: Uint8Array;
	char: string;
	varchar: string;
	tinytext: string;
	text: string;
	mediumtext: string;
	longtext: string;
	enum: string;
	set: string[];
	binary: Uint8Array;
	varbinary: Uint8Array;
	tinyblob: Uint8Array;
	blob: Uint8Array;
	mediumblob: Uint8Array;
	longblob: Uint8Array;
	date: Date;
	datetime: Date;
	timestamp: Date;
	time: Date;
	json: JsonValue;
	geometry: Uint8Array;
	point: Uint8Array;
	uuid: string;
	inet4: string;
	inet6: string;
	vector: unknown;
	null: null;
	unknown: unknown;
}

/**
 * The same adapter on MariaDB, which stores JSON as text: the adapter parses
 * only columns the server reports as JSON, so documents come back as strings.
 */
export interface PrismaMariaDbTypeMap extends Omit<PrismaMysqlTypeMap, "json"> {
	json: string;
}
