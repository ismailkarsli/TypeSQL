import type { DmmfDatamodel, DmmfEnum, DmmfField, DmmfModel } from "./dmmf.js";

export interface EmitOptions {
	/** Module the column helpers are imported from. Default `"@typesql/core"`. */
	readonly importFrom?: string | undefined;
	/** Name of the exported interface. Default `"DB"`. */
	readonly typeName?: string | undefined;
	/** Names of models declared with `view` (they become `View<...>`). See `viewNames`. */
	readonly views?: readonly string[];
}

/** Prisma scalar → Postgres type used by the PostgreSQL connector when no `@db.*` is given. */
export const SCALAR_TYPES: Readonly<Record<string, string>> = {
	Int: "int4",
	BigInt: "int8",
	Float: "float8",
	Decimal: "numeric",
	String: "text",
	Boolean: "bool",
	DateTime: "timestamp",
	Json: "jsonb",
	Bytes: "bytea",
};

/** `@db.*` native type (PostgreSQL connector) → canonical Postgres type name. */
export const NATIVE_TYPES: Readonly<Record<string, string>> = {
	Text: "text",
	Char: "bpchar",
	VarChar: "varchar",
	Bit: "bit",
	VarBit: "varbit",
	Uuid: "uuid",
	Xml: "xml",
	Inet: "inet",
	Citext: "text",
	Boolean: "bool",
	Integer: "int4",
	SmallInt: "int2",
	Oid: "oid",
	BigInt: "int8",
	DoublePrecision: "float8",
	Real: "float4",
	Decimal: "numeric",
	Money: "money",
	Timestamp: "timestamp",
	Timestamptz: "timestamptz",
	Date: "date",
	Time: "time",
	Timetz: "timetz",
	Json: "json",
	JsonB: "jsonb",
	ByteA: "bytea",
};

/**
 * `@default(fn())` functions that become a database DEFAULT on PostgreSQL (`sequence()` is
 * CockroachDB's: Prisma rejects it for the postgresql provider).
 */
const DB_DEFAULT_FUNCTIONS = new Set(["autoincrement", "now", "dbgenerated"]);

/** Names of the `view` blocks in a Prisma schema text (views appear as models in the DMMF). */
export function viewNames(schema: string): string[] {
	return [
		...schema.matchAll(/^[ \t]*view[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*\{/gm),
	].map((m) => m[1]!);
}

/** Postgres type of a field (element type for lists), from `@db.*` or the scalar default. */
export function pgTypeOf(
	field: DmmfField,
	enumNames: ReadonlyMap<string, string>,
): string {
	if (field.kind === "enum") return enumNames.get(field.type) ?? field.type;
	const native = field.nativeType?.[0];
	if (native !== undefined) return NATIVE_TYPES[native] ?? native.toLowerCase();
	return SCALAR_TYPES[field.type] ?? field.type.toLowerCase();
}

/**
 * Whether the column has a database DEFAULT. Client-side defaults (`uuid()`, `cuid()`,
 * `nanoid()`, `ulid()`) and `@updatedAt` are filled in by Prisma Client and have none.
 */
export function hasDbDefault(field: DmmfField): boolean {
	if (!field.hasDefaultValue) return false;
	const d = field.default;
	if (d !== null && typeof d === "object" && !Array.isArray(d))
		return DB_DEFAULT_FUNCTIONS.has((d as { name: string }).name);
	return true;
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const key = (name: string): string =>
	IDENT.test(name) ? name : JSON.stringify(name);
const str = (s: string): string => JSON.stringify(s);
const docText = (s: string): string => s.replace(/\*\//g, "*\\/");

function doc(lines: readonly string[], indent: string): string {
	if (lines.length === 0) return "";
	if (lines.length === 1) return `${indent}/** ${docText(lines[0]!)} */\n`;
	return `${indent}/**\n${lines.map((l) => `${indent} * ${docText(l)}`).join("\n")}\n${indent} */\n`;
}

function columnHelper(
	nullable: boolean,
	hasDefault: boolean,
): "Col" | "Nullable" | "Generated" | "NullableGenerated" {
	return nullable
		? hasDefault
			? "NullableGenerated"
			: "Nullable"
		: hasDefault
			? "Generated"
			: "Col";
}

function enumKeys(enums: readonly DmmfEnum[]): Map<string, string> {
	return new Map(enums.map((e) => [e.name, e.dbName ?? e.name]));
}

/**
 * TypeScript source declaring the TypeSQL schema of a Prisma datamodel (DMMF): database table,
 * column and enum names, native types, nullability (scalar lists are nullable: Prisma creates
 * them without NOT NULL) and database defaults. Models in a non-public `@@schema` are nested
 * under `DB[schema]`. Relation fields are skipped; `Unsupported(...)` fields are not in the DMMF.
 */
export function generateSource(
	datamodel: DmmfDatamodel,
	options: EmitOptions = {},
): string {
	const typeName = options.typeName ?? "DB";
	const views = new Set(options.views);
	const enums = enumKeys(datamodel.enums);
	const used = new Set<string>();

	const table = (model: DmmfModel, indent: string): string => {
		const isView = views.has(model.name);
		const cols: string[] = [];
		for (const f of model.fields) {
			if (f.kind !== "scalar" && f.kind !== "enum") continue;
			const nullable = f.isList || !f.isRequired;
			const helper = columnHelper(nullable, !isView && hasDbDefault(f));
			used.add(helper);
			const type = pgTypeOf(f, enums) + (f.isList ? "[]" : "");
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
				`${doc(notes, indent + "  ")}${indent}  ${key(f.dbName ?? f.name)}: ${helper}<${str(type)}>;`,
			);
		}
		const body = `{\n${cols.join("\n")}\n${indent}}`;
		if (!isView) return body;
		used.add("View");
		return `View<${body}>`;
	};

	const modelDoc = (m: DmmfModel, indent: string): string =>
		doc(
			[
				...((m.dbName ?? m.name) !== m.name
					? [`Prisma ${views.has(m.name) ? "view" : "model"} \`${m.name}\`.`]
					: []),
				...(m.documentation ? m.documentation.split("\n") : []),
			],
			indent,
		);

	const lines: string[] = [];
	const namespaces = new Map<string, DmmfModel[]>();
	for (const m of datamodel.models) {
		const schema = m.schema ?? "public";
		if (schema === "public")
			lines.push(
				`${modelDoc(m, "  ")}  ${key(m.dbName ?? m.name)}: ${table(m, "  ")};`,
			);
		else namespaces.set(schema, [...(namespaces.get(schema) ?? []), m]);
	}
	for (const [schema, models] of namespaces) {
		const tables = models.map(
			(m) =>
				`${modelDoc(m, "    ")}    ${key(m.dbName ?? m.name)}: ${table(m, "    ")};`,
		);
		lines.push(`  ${key(schema)}: {\n${tables.join("\n")}\n  };`);
	}
	if (datamodel.enums.length > 0) {
		const entries = datamodel.enums.map((e) => {
			const values = e.values.map((v) => str(v.dbName ?? v.name)).join(" | ");
			return `${doc(e.dbName && e.dbName !== e.name ? [`Prisma enum \`${e.name}\`.`] : [], "    ")}    ${key(e.dbName ?? e.name)}: ${values || "never"};`;
		});
		lines.push(`  $types: {\n${entries.join("\n")}\n  };`);
	}

	const imports = [
		"Col",
		"Nullable",
		"Generated",
		"NullableGenerated",
		"View",
	].filter((h) => used.has(h));
	return [
		"// Generated by @typesql/prisma from the Prisma schema. Do not edit.",
		...(imports.length > 0
			? [
					`import type { ${imports.join(", ")} } from ${str(options.importFrom ?? "@typesql/core")};`,
				]
			: []),
		"",
		`export interface ${typeName} {`,
		...lines,
		"}",
		"",
	].join("\n");
}
