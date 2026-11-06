// Schema source: the TypeScript that introspection, `typesql migrate
// generate` and the Prisma generator write for a schema.

import { UsageError } from "./command.js";
import { DECLARED_KEYS } from "./schema.js";

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** `name` as a property key: bare when it is an identifier, else quoted. */
export const propertyKey = (name: string): string =>
	IDENT.test(name) ? name : JSON.stringify(name);

/** Keys of a schema object that hold TypeSQL's own entries, not relations. */
export const RESERVED_KEYS: readonly string[] = DECLARED_KEYS;

/** An anchored name-matching expression where `*` matches any text. */
export const globRegExp = (glob: string): RegExp =>
	new RegExp(
		`^${glob
			.split("*")
			.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
			.join(".*")}$`,
	);

/** `lines` as a JSDoc comment at `indent`, or "" without lines. */
export function doc(lines: readonly string[], indent: string): string {
	const text = lines
		.flatMap((l) => l.split("\n"))
		.map((l) => l.replace(/\*\//g, "*\\/").trimEnd());
	if (text.length === 0) return "";
	if (text.length === 1) return `${indent}/** ${text[0]} */\n`;
	return `${indent}/**\n${text.map((l) => `${indent} *${l ? ` ${l}` : ""}`).join("\n")}\n${indent} */\n`;
}

/** The options of a column: what `Col<T, { … }>` takes, in the order it is written. */
export interface ColumnFlags {
	readonly nullable?: boolean | undefined;
	readonly hasDefault?: boolean | undefined;
	readonly position?: number | undefined;
	readonly rowid?: boolean | undefined;
	readonly autoIncrement?: boolean | undefined;
	readonly generated?: boolean | undefined;
	readonly hidden?: boolean | undefined;
}

/** The dialects whose `Col` a schema module imports. */
export type SchemaDialect = "postgres" | "sqlite" | "mysql";

/**
 * The flags that make a dialect's `Col` have a default, so that
 * `hasDefault: true` beside them is left out. They follow `Col` in
 * `@typesql/core/<dialect>` (src/<dialect>/schema/index.ts).
 */
const IMPLY_DEFAULT: Readonly<
	Record<SchemaDialect, readonly (keyof ColumnFlags)[]>
> = {
	postgres: [],
	sqlite: ["generated"],
	mysql: ["autoIncrement", "generated"],
};

/** The source of a column's options, `{ nullable: true; … }`, or "" without any. */
export function colFlags(flags: ColumnFlags, dialect: SchemaDialect): string {
	const implied = IMPLY_DEFAULT[dialect].some((flag) => flags[flag] === true);
	const written = ORDER.flatMap((name) => {
		const value =
			name === "hasDefault" ? flags.hasDefault && !implied : flags[name];
		return value === true || typeof value === "number"
			? [`${name}: ${value}`]
			: [];
	});
	return written.length > 0 ? `{ ${written.join("; ")} }` : "";
}

const ORDER = [
	"nullable",
	"hasDefault",
	"position",
	"rowid",
	"autoIncrement",
	"generated",
	"hidden",
] as const satisfies readonly (keyof ColumnFlags)[];

/** `Col<type, { … }>`, or another column helper of the same shape. */
export function columnSource(
	type: string,
	flags: ColumnFlags,
	dialect: SchemaDialect,
	helper = "Col",
): string {
	const options = colFlags(flags, dialect);
	return options ? `${helper}<${type}, ${options}>` : `${helper}<${type}>`;
}

/**
 * A PostgreSQL `Col<type>` with its `nullable` and `hasDefault` flags.
 * @deprecated Use `columnSource(type, { nullable, hasDefault }, "postgres")`.
 */
export const colSource = (
	type: string,
	nullable: boolean,
	hasDefault: boolean,
): string => columnSource(type, { nullable, hasDefault }, "postgres");

const HELPERS_FROM: Readonly<Record<SchemaDialect, string>> = {
	postgres: "@typesql/core/postgres",
	sqlite: "@typesql/core/sqlite",
	mysql: "@typesql/core/mysql",
};

/** A schema module, around its interface's members. */
export interface SchemaModule {
	/** Its first line's comment: what wrote it. */
	readonly header: string;
	/** The interface's lines. */
	readonly members: readonly string[];
	/** The interface's name, an identifier; default `DB`. */
	readonly typeName?: string | undefined;
	/** The module the column helpers come from; default the dialect's. */
	readonly importFrom?: string | undefined;
	/** More import lines. */
	readonly imports?: readonly string[] | undefined;
}

/**
 * What writes one schema module of `dialect`: its columns, with the
 * dialect's helpers, and the module, which imports the helpers they used.
 */
export function schemaWriter(dialect: SchemaDialect) {
	const used = new Set<string>();
	const helper = (name: string, args: string, flags: ColumnFlags): string => {
		used.add(name);
		return columnSource(args, flags, dialect, name);
	};
	return {
		/** A column of database type `type`: `Col<"type", { … }>`. */
		col: (type: string, flags: ColumnFlags = {}): string =>
			helper("Col", JSON.stringify(type), flags),
		/** A column whose values are one of `values`, a union's source. */
		enum: (values: string, flags: ColumnFlags = {}): string =>
			helper("Enum", values, flags),
		/**
		 * A column of database type `base` whose values are typed `ts`:
		 * PostgreSQL's `Json<ts, …>` (a json or jsonb column), the other
		 * dialects' `Col<Typed<"base", ts>, …>`.
		 */
		typed: (base: string, ts: string, flags: ColumnFlags = {}): string => {
			if (dialect !== "postgres") {
				used.add("Typed");
				return helper("Col", `Typed<${JSON.stringify(base)}, ${ts}>`, flags);
			}
			if (base !== "json") return helper("Json", ts, flags);
			used.add("Json");
			return `Json<${ts}, ${colFlags(flags, dialect) || "{}"}, "json">`;
		},
		/** A view of the columns `body`. */
		view: (body: string): string => {
			used.add("View");
			return `View<${body}>`;
		},
		/** The module, after every column is written. */
		module: (module: SchemaModule): string => {
			const typeName = module.typeName ?? "DB";
			if (!IDENT.test(typeName))
				throw new UsageError(
					`the schema's type name ${JSON.stringify(typeName)} is not a TypeScript identifier`,
				);
			const { members } = module;
			return [
				`// ${module.header}`,
				...helperImport(used, module.importFrom ?? HELPERS_FROM[dialect]),
				...(module.imports ?? []),
				"",
				...(members.length > 0
					? [`export interface ${typeName} {`, ...members, "}"]
					: [`export interface ${typeName} {}`]),
				"",
			].join("\n");
		},
	};
}

/**
 * The members of a schema object: the `public` relations, then an object
 * per other schema with its relations.
 */
export function schemaMembers<R>(
	relations: readonly R[],
	schemaOf: (relation: R) => string,
	member: (relation: R, indent: string) => string,
): string[] {
	const lines: string[] = [];
	const namespaces = new Map<string, R[]>();
	for (const relation of relations) {
		const schema = schemaOf(relation);
		if (schema === "public") lines.push(member(relation, "  "));
		else namespaces.set(schema, [...(namespaces.get(schema) ?? []), relation]);
	}
	for (const [schema, members] of namespaces) {
		const body = members.map((relation) => member(relation, "    "));
		lines.push(`  ${propertyKey(schema)}: {\n${body.join("\n")}\n  };`);
	}
	return lines;
}

/** The import of the column helpers a schema module uses, in a fixed order. */
export function helperImport(
	used: ReadonlySet<string>,
	from: string,
): string[] {
	const helpers = ["Col", "Enum", "Json", "Typed", "View"].filter((h) =>
		used.has(h),
	);
	return helpers.length > 0
		? [`import type { ${helpers.join(", ")} } from ${JSON.stringify(from)};`]
		: [];
}
