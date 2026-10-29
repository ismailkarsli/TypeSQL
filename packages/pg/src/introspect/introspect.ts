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

export interface IntrospectedDatabase {
	readonly version: string;
	readonly schemas: readonly string[];
	readonly relations: readonly IntrospectedRelation[];
	readonly enums: readonly IntrospectedEnum[];
}

export interface IntrospectOptions {
	readonly schemas?: readonly string[];
	readonly exclude?: readonly string[];
	readonly viewNotNull?: NullabilityOptions["notNull"];
}

const globToRegExp = (glob: string): RegExp =>
	new RegExp(
		`^${glob
			.split("*")
			.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
			.join(".*")}$`,
	);

const KINDS: Readonly<Record<string, RelationKind>> = {
	r: "table",
	p: "partitioned table",
	v: "view",
	m: "materialized view",
	f: "foreign table",
};

const TYPE_ALIASES: Readonly<Record<string, string>> = { citext: "text" };

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
			type: TYPE_ALIASES[t.name] ?? t.name,
			notnull: false,
			scalarOid: t.oid,
			domain: null,
		};
	};
	return resolve;
}

const USER_SCHEMAS = `n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'`;

export async function introspect(
	client: PgQueryable,
	options: IntrospectOptions = {},
): Promise<IntrospectedDatabase> {
	const q = async <R>(text: string, values?: unknown[]): Promise<R[]> =>
		(await client.query(text, values)).rows as R[];

	const [{ version }] = (await q<{ version: string }>(
		`SELECT current_setting('server_version') AS version`,
	)) as [{ version: string }];
	const schemaRows = options.schemas
		? await q<{ name: string }>(
				`SELECT n.nspname AS name FROM unnest($1::text[]) WITH ORDINALITY AS s(name, i)
           JOIN pg_namespace n ON n.nspname = s.name ORDER BY s.i`,
				[[...options.schemas]],
			)
		: await q<{ name: string }>(
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
			await q<TypeRow>(
				`SELECT t.oid::int8::text AS oid, t.typname AS name, n.nspname AS schema, t.typtype,
              t.typbasetype::int8::text AS basetype, t.typelem::int8::text AS elem,
              t.typarray::int8::text AS array, t.typnotnull AS notnull
         FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace`,
			)
		).map((t) => [t.oid, t]),
	);
	const resolve = resolver(types);

	const excluded = options.exclude?.map(globToRegExp);
	const relRows = (
		await q<{
			oid: string;
			schema: string;
			name: string;
			relkind: string;
			comment: string | null;
		}>(
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
	const colRows = await q<{
		relid: string;
		name: string;
		typid: string;
		declared: string;
		notnull: boolean;
		identity: string;
		generated: string;
		default: string | null;
		comment: string | null;
	}>(
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
		{
			...(options.viewNotNull && { notNull: options.viewNotNull }),
		},
	);
	const usedTypes = new Set<string>();
	const relations: IntrospectedRelation[] = [];
	for (const rel of relRows) {
		const kind = KINDS[rel.relkind]!;
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

	const enumRows = await q<{
		oid: string;
		schema: string;
		name: string;
		values: string[];
	}>(
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
	return { version, schemas, relations, enums };
}
