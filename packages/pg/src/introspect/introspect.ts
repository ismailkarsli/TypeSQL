import { globRegExp } from "@typesql/core/adapter";
import type { PgQueryable } from "../client.js";
import { type NullabilityOptions, ViewNullability } from "./nullability.js";

export type RelationKind =
	| "table"
	| "partitioned table"
	| "view"
	| "materialized view"
	| "foreign table";

export interface IntrospectedColumn {
	readonly name: string;
	readonly type: string;
	readonly declaredType: string;
	readonly domain: string | null;
	readonly nullable: boolean;
	readonly hasDefault: boolean;
	readonly identity: "always" | "by default" | null;
	readonly generated: string | null;
	/** A PostgreSQL 18 `VIRTUAL` generated column (otherwise `STORED`). */
	readonly virtual?: boolean;
	readonly default: string | null;
	readonly comment: string | null;
}

export interface IntrospectedRelation {
	readonly schema: string;
	readonly name: string;
	readonly kind: RelationKind;
	readonly comment: string | null;
	readonly columns: readonly IntrospectedColumn[];
}

export interface IntrospectedEnum {
	readonly schema: string;
	readonly name: string;
	readonly values: readonly string[];
}

export type FunctionKind = "function" | "aggregate" | "window";

export interface IntrospectedFunction {
	readonly schema: string;
	readonly name: string;
	readonly kind: FunctionKind;
	/**
	 * The argument types a call passes, as TypeSQL names them: `"int4"`,
	 * `"any"` or `"anyarray"` for a polymorphic one. A `VARIADIC` argument is
	 * its element type, followed by `"..."`.
	 */
	readonly args: readonly string[];
	/** How many trailing arguments have a default and can be left out. */
	readonly defaults: number;
	/**
	 * The return type: a type name, a table or view whose row it returns
	 * (`"users"`, `"auth.sessions"`), `"record"`, `"void"`, or `"$1"`,
	 * `"$elem1"`, … for a polymorphic one; `"unknown"` when it can't be told.
	 */
	readonly returns: string;
	/** `RETURNS SETOF` or `RETURNS TABLE`. */
	readonly set: boolean;
	/** `STRICT`: NULL when an argument is NULL, and only then called with none. */
	readonly strict: boolean;
	/**
	 * Can return NULL for arguments that aren't NULL: a function that is not
	 * `STRICT`, unless `functionNotNull` names it.
	 */
	readonly nullable: boolean;
	/** The columns of `RETURNS TABLE (…)` or OUT parameters returning `record`. */
	readonly columns: readonly {
		readonly name: string;
		readonly type: string;
	}[];
	readonly comment: string | null;
}

export interface IntrospectedDatabase {
	readonly version: string;
	readonly schemas: readonly string[];
	readonly relations: readonly IntrospectedRelation[];
	readonly enums: readonly IntrospectedEnum[];
	/**
	 * Functions, aggregates and window functions, without procedures, trigger
	 * functions and the functions of extensions.
	 */
	readonly functions?: readonly IntrospectedFunction[] | undefined;
}

export interface IntrospectOptions {
	readonly schemas?: readonly string[];
	readonly exclude?: readonly string[];
	readonly viewNotNull?: NullabilityOptions["notNull"];
	/**
	 * The functions that return NULL only when an argument is NULL, which
	 * PostgreSQL records only for `STRICT` ones.
	 */
	readonly functionNotNull?: (
		fn: Omit<IntrospectedFunction, "nullable">,
	) => boolean;
}

const KINDS: ReadonlyMap<string, RelationKind> = new Map([
	["r", "table"],
	["p", "partitioned table"],
	["v", "view"],
	["m", "materialized view"],
	["f", "foreign table"],
]);

const TYPE_ALIASES: ReadonlyMap<string, string> = new Map([["citext", "text"]]);

// Rows of the catalog queries below, as node-postgres returns them.

interface VersionRow {
	readonly version: string;
}

interface NameRow {
	readonly name: string;
}

interface TypeRow {
	readonly oid: string;
	readonly name: string;
	readonly schema: string;
	readonly typtype: string;
	readonly basetype: string;
	readonly elem: string;
	readonly array: string;
	readonly notnull: boolean;
}

interface RelationRow {
	readonly oid: string;
	readonly schema: string;
	readonly name: string;
	readonly relkind: string;
	readonly comment: string | null;
}

interface ColumnRow {
	readonly relid: string;
	readonly name: string;
	readonly typid: string;
	readonly declared: string;
	readonly notnull: boolean;
	readonly identity: string;
	readonly generated: string;
	readonly default: string | null;
	readonly comment: string | null;
}

interface FunctionRow {
	readonly schema: string;
	readonly name: string;
	readonly kind: string;
	readonly set: boolean;
	readonly strict: boolean;
	readonly ret: string;
	readonly variadic: string;
	readonly defaults: number;
	readonly args: readonly string[];
	readonly outTypes: readonly string[];
	readonly outNames: readonly string[];
	readonly comment: string | null;
}

interface EnumRow {
	readonly oid: string;
	readonly schema: string;
	readonly name: string;
	readonly values: readonly string[];
}

const isVersionRow = (row: unknown): row is VersionRow =>
	typeof row === "object" &&
	row !== null &&
	"version" in row &&
	typeof row.version === "string";

const isNameRow = (row: unknown): row is NameRow =>
	typeof row === "object" &&
	row !== null &&
	"name" in row &&
	typeof row.name === "string";

const isTypeRow = (row: unknown): row is TypeRow =>
	isNameRow(row) &&
	"oid" in row &&
	typeof row.oid === "string" &&
	"schema" in row &&
	typeof row.schema === "string" &&
	"typtype" in row &&
	typeof row.typtype === "string" &&
	"basetype" in row &&
	typeof row.basetype === "string" &&
	"elem" in row &&
	typeof row.elem === "string" &&
	"array" in row &&
	typeof row.array === "string" &&
	"notnull" in row &&
	typeof row.notnull === "boolean";

const isComment = (comment: unknown): comment is string | null =>
	comment === null || typeof comment === "string";

const isRelationRow = (row: unknown): row is RelationRow =>
	isNameRow(row) &&
	"oid" in row &&
	typeof row.oid === "string" &&
	"schema" in row &&
	typeof row.schema === "string" &&
	"relkind" in row &&
	typeof row.relkind === "string" &&
	"comment" in row &&
	isComment(row.comment);

const isColumnRow = (row: unknown): row is ColumnRow =>
	isNameRow(row) &&
	"relid" in row &&
	typeof row.relid === "string" &&
	"typid" in row &&
	typeof row.typid === "string" &&
	"declared" in row &&
	typeof row.declared === "string" &&
	"notnull" in row &&
	typeof row.notnull === "boolean" &&
	"identity" in row &&
	typeof row.identity === "string" &&
	"generated" in row &&
	typeof row.generated === "string" &&
	"default" in row &&
	isComment(row.default) &&
	"comment" in row &&
	isComment(row.comment);

const isStrings = (value: unknown): value is readonly string[] =>
	Array.isArray(value) && value.every((v) => typeof v === "string");

const isFunctionRow = (row: unknown): row is FunctionRow =>
	isNameRow(row) &&
	"schema" in row &&
	typeof row.schema === "string" &&
	"kind" in row &&
	typeof row.kind === "string" &&
	"set" in row &&
	typeof row.set === "boolean" &&
	"strict" in row &&
	typeof row.strict === "boolean" &&
	"ret" in row &&
	typeof row.ret === "string" &&
	"variadic" in row &&
	typeof row.variadic === "string" &&
	"defaults" in row &&
	typeof row.defaults === "number" &&
	"args" in row &&
	isStrings(row.args) &&
	"outTypes" in row &&
	isStrings(row.outTypes) &&
	"outNames" in row &&
	isStrings(row.outNames) &&
	"comment" in row &&
	isComment(row.comment);

const isEnumRow = (row: unknown): row is EnumRow =>
	isNameRow(row) &&
	"oid" in row &&
	typeof row.oid === "string" &&
	"schema" in row &&
	typeof row.schema === "string" &&
	"values" in row &&
	Array.isArray(row.values) &&
	row.values.every((value) => typeof value === "string");

interface ResolvedType {
	readonly type: string;
	readonly notnull: boolean;
	readonly scalarOid: string;
	readonly domain: string | null;
}

function resolver(types: ReadonlyMap<string, TypeRow>) {
	const resolve = (oid: string): ResolvedType => {
		const t = types.get(oid);
		if (!t)
			return { type: "unknown", notnull: false, scalarOid: oid, domain: null };
		if (t.typtype === "d") {
			const base = resolve(t.basetype);
			return {
				...base,
				notnull: base.notnull || t.notnull,
				domain: `${t.schema}.${t.name}`,
			};
		}
		const elem = types.get(t.elem);
		if (elem && elem.array === t.oid) {
			const inner = resolve(elem.oid);
			return {
				type: inner.type.endsWith("[]") ? inner.type : `${inner.type}[]`,
				notnull: false,
				scalarOid: inner.scalarOid,
				domain: null,
			};
		}
		return {
			type: TYPE_ALIASES.get(t.name) ?? t.name,
			notnull: false,
			scalarOid: t.oid,
			domain: null,
		};
	};
	return resolve;
}

const FUNCTION_KINDS: ReadonlyMap<string, FunctionKind> = new Map([
	["f", "function"],
	["a", "aggregate"],
	["w", "window"],
]);

/** Polymorphic pseudo-types, as the argument category TypeSQL checks. */
const POLYMORPHIC: ReadonlyMap<string, string> = new Map([
	["any", "any"],
	["anyelement", "any"],
	["anynonarray", "any"],
	["anyenum", "any"],
	["anycompatible", "any"],
	["anycompatiblenonarray", "any"],
	["anymultirange", "any"],
	["anycompatiblemultirange", "any"],
	["anyarray", "anyarray"],
	["anycompatiblearray", "anyarray"],
	["anyrange", "anyrange"],
	["anycompatiblerange", "anyrange"],
]);

/** The pseudo-types of arguments and results SQL can still pass. */
const CALLABLE_PSEUDO = new Set([...POLYMORPHIC.keys(), "record", "void"]);

const elementLike = (t: string): boolean =>
	POLYMORPHIC.get(t) === "any" && t !== "any";
const arrayLike = (t: string): boolean => POLYMORPHIC.get(t) === "anyarray";

/**
 * A polymorphic return type in terms of the declared arguments: `$n` for the
 * type of argument n, `$elem1` and `$arr1` for the first one's element or
 * array, else `unknown`.
 */
function polymorphicReturn(ret: string, args: readonly string[]): string {
	const at = args.findIndex((a) =>
		elementLike(ret)
			? elementLike(a)
			: POLYMORPHIC.get(a) === POLYMORPHIC.get(ret),
	);
	if (at >= 0 && at < 4) return `$${at + 1}`;
	const [first = ""] = args;
	if (elementLike(ret) && arrayLike(first)) return "$elem1";
	if (arrayLike(ret) && elementLike(first)) return "$arr1";
	return "unknown";
}

const USER_SCHEMAS = `n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'`;

export async function introspect(
	client: PgQueryable,
	options: IntrospectOptions = {},
): Promise<IntrospectedDatabase> {
	const q = async <R>(
		isRow: (row: unknown) => row is R,
		text: string,
		values?: unknown[],
	): Promise<R[]> => {
		const { rows } = await client.query(text, values);
		if (rows.every(isRow)) return rows;
		throw new Error("unexpected row from a system catalog query");
	};

	const [setting] = await q(
		isVersionRow,
		`SELECT current_setting('server_version') AS version`,
	);
	if (!setting) throw new Error("the server did not report its version");
	const { version } = setting;
	const schemaRows = options.schemas
		? await q(
				isNameRow,
				`SELECT n.nspname AS name FROM unnest($1::text[]) WITH ORDINALITY AS s(name, i)
           JOIN pg_namespace n ON n.nspname = s.name ORDER BY s.i`,
				[[...options.schemas]],
			)
		: await q(
				isNameRow,
				`SELECT n.nspname AS name FROM pg_namespace n WHERE ${USER_SCHEMAS}
          ORDER BY n.nspname <> 'public', n.nspname`,
			);
	const schemas = schemaRows.map((r) => r.name);
	const missing = (options.schemas ?? []).filter((s) => !schemas.includes(s));
	if (missing.length > 0)
		throw new Error(
			`schema ${missing.map((s) => JSON.stringify(s)).join(", ")} does not exist`,
		);

	const types = new Map(
		(
			await q(
				isTypeRow,
				`SELECT t.oid::int8::text AS oid, t.typname AS name, n.nspname AS schema, t.typtype,
              t.typbasetype::int8::text AS basetype, t.typelem::int8::text AS elem,
              t.typarray::int8::text AS array, t.typnotnull AS notnull
         FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace`,
			)
		).map((t) => [t.oid, t]),
	);
	const resolve = resolver(types);

	const excluded = options.exclude?.map(globRegExp);
	const relRows = (
		await q(
			isRelationRow,
			`SELECT c.oid::int8::text AS oid, n.nspname AS schema, c.relname AS name, c.relkind,
            obj_description(c.oid, 'pg_class') AS comment
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND n.nspname = ANY($1::text[])
      ORDER BY array_position($1::text[], n.nspname::text), c.relname`,
			[schemas],
		)
	).filter(
		(r) =>
			!excluded?.some(
				(re) => re.test(r.name) || re.test(`${r.schema}.${r.name}`),
			),
	);
	const colRows = await q(
		isColumnRow,
		`SELECT a.attrelid::int8::text AS relid, a.attname AS name, a.atttypid::int8::text AS typid,
            format_type(a.atttypid, a.atttypmod) AS declared, a.attnotnull AS notnull,
            a.attidentity AS identity, a.attgenerated AS generated,
            pg_get_expr(d.adbin, d.adrelid) AS default, col_description(a.attrelid, a.attnum) AS comment
       FROM pg_attribute a
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = ANY($1::oid[]) AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attrelid, a.attnum`,
		[relRows.map((r) => r.oid)],
	);
	const colsByRel = new Map<string, typeof colRows>();
	for (const c of colRows)
		colsByRel.set(c.relid, [...(colsByRel.get(c.relid) ?? []), c]);

	const views = new ViewNullability(
		(text, values) => client.query(text, values),
		options.viewNotNull && { notNull: options.viewNotNull },
	);
	const usedTypes = new Set<string>();
	const relations: IntrospectedRelation[] = [];
	for (const rel of relRows) {
		const kind = KINDS.get(rel.relkind)!;
		const isView = kind === "view" || kind === "materialized view";
		const viewNotNull = isView ? await views.notNull(rel.oid) : null;
		const columns = (colsByRel.get(rel.oid) ?? []).map(
			(c, i): IntrospectedColumn => {
				const t = resolve(c.typid);
				usedTypes.add(t.scalarOid);
				const generated = c.generated !== "" ? c.default : null;
				const identity =
					c.identity === "a"
						? "always"
						: c.identity === "d"
							? "by default"
							: null;
				return {
					name: c.name,
					type: t.type,
					declaredType: c.declared,
					domain: t.domain,
					nullable: viewNotNull ? !viewNotNull[i] : !(c.notnull || t.notnull),
					hasDefault: !isView && (c.default !== null || identity !== null),
					identity,
					generated,
					...(c.generated === "v" && { virtual: true }),
					default: generated === null ? c.default : null,
					comment: c.comment,
				};
			},
		);
		relations.push({
			schema: rel.schema,
			name: rel.name,
			kind,
			comment: rel.comment,
			columns,
		});
	}

	const functions = await readFunctions();

	const enumRows = await q(
		isEnumRow,
		`SELECT t.oid::int8::text AS oid, n.nspname AS schema, t.typname AS name,
            array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS values
       FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = ANY($1::text[]) OR t.oid = ANY($2::oid[])
      GROUP BY t.oid, n.nspname, t.typname
      ORDER BY t.typname, n.nspname`,
		[schemas, [...usedTypes]],
	);
	const enums = enumRows.map(({ schema, name, values }) => ({
		schema,
		name,
		values,
	}));
	return { version, schemas, relations, enums, functions };

	async function readFunctions(): Promise<IntrospectedFunction[]> {
		const rows = await q(
			isFunctionRow,
			`SELECT n.nspname AS schema, p.proname AS name, p.prokind AS kind,
              p.proretset AS set, p.proisstrict AS strict,
              p.prorettype::int8::text AS ret, p.provariadic::int8::text AS variadic,
              p.pronargdefaults::int4 AS defaults,
              p.proargtypes::oid[]::int8[]::text[] AS args,
              array(SELECT a.t::int8::text FROM unnest(p.proallargtypes, p.proargmodes) AS a(t, m)
                     WHERE a.m IN ('o', 'b', 't')) AS "outTypes",
              array(SELECT coalesce(a.nm, '') FROM unnest(p.proallargtypes, p.proargmodes, p.proargnames) AS a(t, m, nm)
                     WHERE a.m IN ('o', 'b', 't')) AS "outNames",
              obj_description(p.oid, 'pg_proc') AS comment
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.prokind IN ('f', 'a', 'w') AND n.nspname = ANY($1::text[])
          AND NOT EXISTS (SELECT FROM pg_depend d
                           WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
        ORDER BY array_position($1::text[], n.nspname::text), p.proname, p.pronargs, p.oid`,
			[schemas],
		);
		/** A type as a function's argument or result, or null for one SQL can't pass. */
		const typeName = (oid: string): string | null => {
			const t = types.get(oid);
			if (t?.typtype === "p")
				return CALLABLE_PSEUDO.has(t.name)
					? (POLYMORPHIC.get(t.name) ?? t.name)
					: null;
			// The row type of a table or view, which FROM reads as its columns.
			if (t?.typtype === "c")
				return t.schema === "public" ? t.name : `${t.schema}.${t.name}`;
			const resolved = resolve(oid);
			usedTypes.add(resolved.scalarOid);
			return resolved.type;
		};
		const functions: IntrospectedFunction[] = [];
		for (const row of rows) {
			if (
				excluded?.some(
					(re) => re.test(row.name) || re.test(`${row.schema}.${row.name}`),
				)
			)
				continue;
			const variadic = row.variadic !== "0";
			const args = row.args.map((oid, i) =>
				typeName(variadic && i === row.args.length - 1 ? row.variadic : oid),
			);
			const retName = types.get(row.ret)?.name ?? "";
			const returns = POLYMORPHIC.has(retName)
				? polymorphicReturn(
						retName,
						row.args.map((oid) => types.get(oid)?.name ?? ""),
					)
				: typeName(row.ret);
			const kind = FUNCTION_KINDS.get(row.kind);
			// Leaves out trigger functions, and those taking or returning `internal`.
			if (
				kind === undefined ||
				returns === null ||
				args.some((a) => a === null || a === "void")
			)
				continue;
			const fn: Omit<IntrospectedFunction, "nullable"> = {
				schema: row.schema,
				name: row.name,
				kind,
				args: [...args.filter((a) => a !== null), ...(variadic ? ["..."] : [])],
				defaults: row.defaults,
				returns,
				set: row.set,
				strict: row.strict,
				columns:
					returns === "record"
						? row.outTypes.map((oid, i) => ({
								// PostgreSQL's name for an unnamed OUT parameter.
								name: row.outNames[i] || `column${i + 1}`,
								type: typeName(oid) ?? "unknown",
							}))
						: [],
				comment: row.comment,
			};
			// An aggregate's or window function's NULLs follow its rows.
			const nullable =
				kind === "function" &&
				!row.strict &&
				!(options.functionNotNull?.(fn) ?? false);
			functions.push({ ...fn, nullable });
		}
		return functions;
	}
}
