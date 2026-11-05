import {
	colSource,
	propertyKey as key,
	schemaMembers,
} from "@typesql/core/adapter";
import type { DmmfDatamodel, DmmfEnum, DmmfField, DmmfModel } from "./dmmf.js";

export interface EmitOptions {
	readonly dialect?: "postgres" | "sqlite" | "mysql" | undefined;
	readonly importFrom?: string | undefined;
	readonly typeName?: string | undefined;
	readonly views?: readonly string[];
	/** Field order and `Unsupported(...)` fields per model, from `schemaFields`. */
	readonly fields?: ReadonlyMap<string, readonly SchemaField[]>;
}

/** A field as written in the schema text; DMMF leaves out `Unsupported` ones. */
export interface SchemaField {
	readonly name: string;
	readonly unsupported?: {
		readonly type: string;
		readonly nullable: boolean;
		readonly dbName: string | undefined;
		readonly hasDefault: boolean;
	};
}

const SCALAR_TYPES: ReadonlyMap<string, string> = new Map([
	["Int", "int4"],
	["BigInt", "int8"],
	["Float", "float8"],
	["Decimal", "numeric"],
	["String", "text"],
	["Boolean", "bool"],
	["DateTime", "timestamp"],
	["Json", "jsonb"],
	["Bytes", "bytea"],
]);

const SQLITE_SCALAR_TYPES: ReadonlyMap<string, string> = new Map([
	["Int", "integer"],
	["BigInt", "bigint"],
	["Float", "real"],
	["Decimal", "decimal"],
	["String", "text"],
	["Boolean", "boolean"],
	["DateTime", "datetime"],
	["Json", "jsonb"],
	["Bytes", "blob"],
]);

const MYSQL_SCALAR_TYPES: ReadonlyMap<string, string> = new Map([
	["Int", "int"],
	["BigInt", "bigint"],
	["Float", "double"],
	["Decimal", "decimal"],
	["String", "varchar"],
	["Boolean", "tinyint"],
	["DateTime", "datetime"],
	["Json", "json"],
	["Bytes", "longblob"],
]);

const MYSQL_NATIVE_TYPES: ReadonlyMap<string, string> = new Map([
	["TinyInt", "tinyint"],
	["SmallInt", "smallint"],
	["MediumInt", "mediumint"],
	["Int", "int"],
	["BigInt", "bigint"],
	["UnsignedTinyInt", "tinyint unsigned"],
	["UnsignedSmallInt", "smallint unsigned"],
	["UnsignedMediumInt", "mediumint unsigned"],
	["UnsignedInt", "int unsigned"],
	["UnsignedBigInt", "bigint unsigned"],
	["Decimal", "decimal"],
	["Float", "float"],
	["Double", "double"],
	["Bit", "bit"],
	["Char", "char"],
	["VarChar", "varchar"],
	["TinyText", "tinytext"],
	["Text", "text"],
	["MediumText", "mediumtext"],
	["LongText", "longtext"],
	["Binary", "binary"],
	["VarBinary", "varbinary"],
	["TinyBlob", "tinyblob"],
	["Blob", "blob"],
	["MediumBlob", "mediumblob"],
	["LongBlob", "longblob"],
	["Date", "date"],
	["DateTime", "datetime"],
	["Timestamp", "timestamp"],
	["Time", "time"],
	["Year", "year"],
	["Json", "json"],
]);

const NATIVE_TYPES: ReadonlyMap<string, string> = new Map([
	["Text", "text"],
	["Char", "bpchar"],
	["VarChar", "varchar"],
	["Bit", "bit"],
	["VarBit", "varbit"],
	["Uuid", "uuid"],
	["Xml", "xml"],
	["Inet", "inet"],
	["Citext", "text"],
	["Boolean", "bool"],
	["Integer", "int4"],
	["SmallInt", "int2"],
	["Oid", "oid"],
	["BigInt", "int8"],
	["DoublePrecision", "float8"],
	["Real", "float4"],
	["Decimal", "numeric"],
	["Money", "money"],
	["Timestamp", "timestamp"],
	["Timestamptz", "timestamptz"],
	["Date", "date"],
	["Time", "time"],
	["Timetz", "timetz"],
	["Json", "json"],
	["JsonB", "jsonb"],
	["ByteA", "bytea"],
]);

const DB_DEFAULT_FUNCTIONS = new Set(["autoincrement", "now", "dbgenerated"]);

export function viewNames(schema: string): string[] {
	return [
		...schema.matchAll(/^[ \t]*view[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*\{/gm),
	].map((m) => m[1]!);
}

const BLOCK =
	/^[ \t]*(?:model|view)[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*\{([\s\S]*?)^[ \t]*\}/gm;
const FIELD =
	/^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]+(Unsupported\("(?:[^"\\]|\\.)*"\)(?:\[\])?\??|\S+)(.*)$/;
const UNSUPPORTED = /^Unsupported\("((?:[^"\\]|\\.)*)"\)(\[\])?(\?)?$/;

export function schemaFields(schema: string): Map<string, SchemaField[]> {
	const models = new Map<string, SchemaField[]>();
	for (const [, model, body] of schema.matchAll(BLOCK)) {
		const fields: SchemaField[] = [];
		for (const line of body!.split("\n")) {
			const m = FIELD.exec(line.replace(/\/\/.*$/, ""));
			if (!m || m[1]!.startsWith("@")) continue;
			const [, name, type, rest = ""] = m;
			const u = UNSUPPORTED.exec(type!);
			if (!u) {
				fields.push({ name: name! });
				continue;
			}
			const base = u[1]!.replace(/\(.*$/, "").trim().toLowerCase();
			fields.push({
				name: name!,
				unsupported: {
					type: `${base}${u[2] ?? ""}`,
					nullable: u[3] !== undefined || u[2] !== undefined,
					dbName: /@map\(\s*"((?:[^"\\]|\\.)*)"/.exec(rest)?.[1],
					hasDefault: /@default\(/.test(rest),
				},
			});
		}
		models.set(model!, fields);
	}
	return models;
}

function pgTypeOf(
	field: DmmfField,
	enumNames: ReadonlyMap<string, string>,
): string {
	if (field.kind === "enum") return enumNames.get(field.type) ?? field.type;
	const native = field.nativeType?.[0];
	if (native !== undefined)
		return NATIVE_TYPES.get(native) ?? native.toLowerCase();
	return SCALAR_TYPES.get(field.type) ?? field.type.toLowerCase();
}

function hasDbDefault(field: DmmfField): boolean {
	if (!field.hasDefaultValue) return false;
	const d = field.default;
	if (d !== null && typeof d === "object" && !Array.isArray(d))
		return "name" in d && DB_DEFAULT_FUNCTIONS.has(d.name);
	return true;
}

const str = (s: string): string => JSON.stringify(s);
const docText = (s: string): string => s.replace(/\*\//g, "*\\/");

function doc(lines: readonly string[], indent: string): string {
	if (lines.length === 0) return "";
	if (lines.length === 1) return `${indent}/** ${docText(lines[0]!)} */\n`;
	return `${indent}/**\n${lines.map((l) => `${indent} * ${docText(l)}`).join("\n")}\n${indent} */\n`;
}

/** `colSource`, with MySQL's `autoIncrement` flag. */
function column(
	type: string,
	nullable: boolean,
	hasDefault: boolean,
	autoIncrement: boolean,
): string {
	if (!autoIncrement) return colSource(type, nullable, hasDefault);
	const flags = [
		...(nullable ? ["nullable: true"] : []),
		"hasDefault: true",
		"autoIncrement: true",
	];
	return `Col<${type}, { ${flags.join("; ")} }>`;
}

function sqliteTypeOf(field: DmmfField, enums: readonly DmmfEnum[]): string {
	if (field.kind === "enum") {
		const e = enums.find((x) => x.name === field.type);
		const values = (e?.values ?? []).map((v) => str(v.dbName ?? v.name));
		return `Typed<"text", ${values.join(" | ") || "never"}>`;
	}
	return str(SQLITE_SCALAR_TYPES.get(field.type) ?? field.type.toLowerCase());
}

function mysqlTypeOf(field: DmmfField, enums: readonly DmmfEnum[]): string {
	if (field.kind === "enum") {
		const e = enums.find((x) => x.name === field.type);
		const values = (e?.values ?? []).map((v) => str(v.dbName ?? v.name));
		return `Typed<"enum", ${values.join(" | ") || "never"}>`;
	}
	const native = field.nativeType?.[0];
	if (native !== undefined)
		return str(MYSQL_NATIVE_TYPES.get(native) ?? native.toLowerCase());
	return str(MYSQL_SCALAR_TYPES.get(field.type) ?? field.type.toLowerCase());
}

const isAutoIncrement = (field: DmmfField): boolean => {
	const d = field.default;
	return (
		d !== null &&
		d !== undefined &&
		typeof d === "object" &&
		"name" in d &&
		d.name === "autoincrement"
	);
};

export function generateSource(
	datamodel: DmmfDatamodel,
	options: EmitOptions = {},
): string {
	const typeName = options.typeName ?? "DB";
	const views = new Set(options.views);
	const enums = new Map(
		datamodel.enums.map((e) => [e.name, e.dbName ?? e.name]),
	);
	const used = new Set<string>();
	const sqlite = options.dialect === "sqlite";
	const mysql = options.dialect === "mysql";

	const table = (model: DmmfModel, indent: string): string => {
		const isView = views.has(model.name);
		const cols: string[] = [];
		const written = options.fields?.get(model.name) ?? [];
		const byName = new Map(model.fields.map((f) => [f.name, f]));
		const ordered: (DmmfField | SchemaField)[] = [
			...written.flatMap((w): (DmmfField | SchemaField)[] => {
				const f = byName.get(w.name);
				return f ? [f] : w.unsupported ? [w] : [];
			}),
			...model.fields.filter((f) => !written.some((w) => w.name === f.name)),
		];
		for (const f of ordered) {
			if (!("kind" in f)) {
				const u = f.unsupported;
				if (u && !sqlite) {
					used.add("Col");
					cols.push(
						`${doc(u.dbName ? [`Prisma field \`${f.name}\`: Unsupported.`] : ["Prisma `Unsupported` field."], `${indent}  `)}${indent}  ${key(u.dbName ?? f.name)}: ${colSource(str(u.type), u.nullable, !isView && u.hasDefault)};`,
					);
				}
				continue;
			}
			if (f.kind !== "scalar" && f.kind !== "enum") continue;
			const nullable = f.isList || !f.isRequired;
			used.add("Col");
			const type = sqlite
				? sqliteTypeOf(f, datamodel.enums)
				: mysql
					? mysqlTypeOf(f, datamodel.enums)
					: str(pgTypeOf(f, enums) + (f.isList ? "[]" : ""));
			if ((sqlite || mysql) && f.kind === "enum") used.add("Typed");
			const notes = [
				...(f.dbName && f.dbName !== f.name
					? [`Prisma field \`${f.name}\`.`]
					: []),
				...(f.isUpdatedAt
					? ["`@updatedAt`: set by Prisma Client, no database default."]
					: []),
				...(f.documentation ? f.documentation.split("\n") : []),
			];
			cols.push(
				`${doc(notes, `${indent}  `)}${indent}  ${key(f.dbName ?? f.name)}: ${column(type, nullable, !isView && hasDbDefault(f), mysql && !isView && isAutoIncrement(f))};`,
			);
		}
		const body = `{\n${cols.join("\n")}\n${indent}}`;
		if (!isView) return body;
		used.add("View");
		return `View<${body}>`;
	};

	const lines = schemaMembers(
		datamodel.models,
		(m) => (sqlite ? "public" : (m.schema ?? "public")),
		(m, indent) =>
			`${doc(
				[
					...((m.dbName ?? m.name) !== m.name
						? [`Prisma ${views.has(m.name) ? "view" : "model"} \`${m.name}\`.`]
						: []),
					...(m.documentation ? m.documentation.split("\n") : []),
				],
				indent,
			)}${indent}${key(m.dbName ?? m.name)}: ${table(m, indent)};`,
	);
	if (!sqlite && !mysql && datamodel.enums.length > 0) {
		const entries = datamodel.enums.map((e) => {
			const values = e.values.map((v) => str(v.dbName ?? v.name)).join(" | ");
			return `${doc(e.dbName && e.dbName !== e.name ? [`Prisma enum \`${e.name}\`.`] : [], "    ")}    ${key(e.dbName ?? e.name)}: ${values || "never"};`;
		});
		lines.push(`  $types: {\n${entries.join("\n")}\n  };`);
	}

	const imports = ["Col", "Typed", "View"].filter((h) => used.has(h));
	const from =
		options.importFrom ??
		(sqlite
			? "@typesql/core/sqlite"
			: mysql
				? "@typesql/core/mysql"
				: "@typesql/core/postgres");
	return [
		"// Generated by @typesql/prisma from the Prisma schema. Do not edit.",
		...(imports.length > 0
			? [`import type { ${imports.join(", ")} } from ${str(from)};`]
			: []),
		"",
		`export interface ${typeName} {`,
		...lines,
		"}",
		"",
	].join("\n");
}
