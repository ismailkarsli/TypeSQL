import type {
	IntrospectedColumn,
	IntrospectedDatabase,
	IntrospectedRelation,
} from "./introspect.js";

export interface GenerateOptions {
	readonly typeName?: string;
	readonly importFrom?: string;
	readonly imports?: readonly string[];
	readonly columnTypes?:
		| Readonly<Record<string, string>>
		| ((
				column: IntrospectedColumn,
				relation: IntrospectedRelation,
		  ) => string | undefined);
	readonly column?: (
		column: IntrospectedColumn,
		relation: IntrospectedRelation,
	) => string | undefined;
	readonly comments?: boolean;
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const key = (name: string): string =>
	IDENT.test(name) ? name : JSON.stringify(name);
const str = (s: string): string => JSON.stringify(s);

function doc(lines: readonly string[], indent: string): string {
	const text = lines
		.flatMap((l) => l.split("\n"))
		.map((l) => l.replace(/\*\//g, "*\\/").trimEnd());
	if (text.length === 0) return "";
	if (text.length === 1) return `${indent}/** ${text[0]} */\n`;
	return `${indent}/**\n${text.map((l) => `${indent} *${l ? ` ${l}` : ""}`).join("\n")}\n${indent} */\n`;
}

type Helper = "Col" | "Nullable" | "Generated" | "NullableGenerated" | "Json";
const helperFor = (nullable: boolean, hasDefault: boolean): Helper =>
	nullable
		? hasDefault
			? "NullableGenerated"
			: "Nullable"
		: hasDefault
			? "Generated"
			: "Col";

function columnNotes(c: IntrospectedColumn): string[] {
	const notes: string[] = [];
	if (c.comment) notes.push(c.comment);
	if (c.domain) notes.push(`Domain \`${c.domain}\`.`);
	else if (c.declaredType === "citext")
		notes.push("`citext`: typed as `text`.");
	if (c.generated !== null)
		notes.push(
			`\`GENERATED ALWAYS AS (${c.generated}) ${c.virtual ? "VIRTUAL" : "STORED"}\`: cannot be written.`,
		);
	if (c.identity === "always")
		notes.push(
			"`GENERATED ALWAYS AS IDENTITY`: written only with `OVERRIDING SYSTEM VALUE`.",
		);
	return notes;
}

export function generateSource(
	db: IntrospectedDatabase,
	options: GenerateOptions = {},
): string {
	const typeName = options.typeName ?? "DB";
	const comments = options.comments ?? true;
	const columnTypes = options.columnTypes ?? {};
	const used = new Set<string>();
	const usedKeys = new Set<string>();

	const customType = (
		rel: IntrospectedRelation,
		col: IntrospectedColumn,
	): string | undefined => {
		const qualified = `${rel.schema}.${rel.name}.${col.name}`;
		const short = `${rel.name}.${col.name}`;
		let ts: string | undefined;
		if (typeof columnTypes === "function") ts = columnTypes(col, rel);
		else {
			const k =
				rel.schema === "public" && !(qualified in columnTypes)
					? short
					: qualified;
			usedKeys.add(k);
			ts = columnTypes[k];
		}
		if (ts !== undefined && col.type !== "json" && col.type !== "jsonb") {
			throw new Error(
				`columnTypes: ${JSON.stringify(rel.schema === "public" ? short : qualified)} has type ${col.type}; columnTypes only types json / jsonb columns (use the column hook for others)`,
			);
		}
		return ts;
	};

	const jsonDescriptor = (col: IntrospectedColumn, ts: string): string => {
		const flags = [
			...(col.nullable ? ["nullable: true"] : []),
			...(col.hasDefault ? ["hasDefault: true"] : []),
		];
		const flagSource = flags.length > 0 ? `{ ${flags.join("; ")} }` : "{}";
		used.add("Json");
		if (col.type === "json") return `Json<${ts}, ${flagSource}, "json">`;
		return flags.length > 0 ? `Json<${ts}, ${flagSource}>` : `Json<${ts}>`;
	};

	const relation = (rel: IntrospectedRelation, indent: string): string => {
		const isView = rel.kind === "view" || rel.kind === "materialized view";
		const cols = rel.columns.map((c) => {
			let descriptor = options.column?.(c, rel);
			if (descriptor === undefined) {
				const custom = customType(rel, c);
				if (custom !== undefined) descriptor = jsonDescriptor(c, custom);
				else {
					const helper = helperFor(c.nullable, c.hasDefault);
					used.add(helper);
					descriptor = `${helper}<${str(c.type)}>`;
				}
			}
			return `${comments ? doc(columnNotes(c), `${indent}  `) : ""}${indent}  ${key(c.name)}: ${descriptor};`;
		});
		const body = `{\n${cols.join("\n")}\n${indent}}`;
		if (!isView) return body;
		used.add("View");
		return `View<${body}>`;
	};

	const relDoc = (rel: IntrospectedRelation, indent: string): string => {
		if (!comments) return "";
		const kind =
			rel.kind === "table"
				? []
				: [`${rel.kind[0]!.toUpperCase()}${rel.kind.slice(1)}.`];
		return doc([...(rel.comment ? [rel.comment] : []), ...kind], indent);
	};

	const topLevel = new Set(
		db.relations.filter((r) => r.schema === "public").map((r) => r.name),
	);
	for (const reserved of ["$types", "$functions"])
		if (
			topLevel.has(reserved) ||
			db.relations.some((r) => r.schema === reserved)
		)
			throw new Error(
				`"${reserved}" is a relation or schema name, but TypeSQL's schema uses the key ${reserved}; leave it out with --exclude '${reserved}'`,
			);
	const lines: string[] = [];
	const namespaces = new Map<string, IntrospectedRelation[]>();
	for (const rel of db.relations) {
		if (rel.schema === "public")
			lines.push(
				`${relDoc(rel, "  ")}  ${key(rel.name)}: ${relation(rel, "  ")};`,
			);
		else
			namespaces.set(rel.schema, [...(namespaces.get(rel.schema) ?? []), rel]);
	}
	for (const [schema, rels] of namespaces) {
		if (topLevel.has(schema)) {
			throw new Error(
				`schema "${schema}" has the same name as the table "public.${schema}": TypeSQL keeps public relations and schemas in one object`,
			);
		}
		const body = rels.map(
			(r) => `${relDoc(r, "    ")}    ${key(r.name)}: ${relation(r, "    ")};`,
		);
		lines.push(`  ${key(schema)}: {\n${body.join("\n")}\n  };`);
	}

	if (db.enums.length > 0) {
		const byName = new Map<
			string,
			{ values: Set<string>; schemas: string[] }
		>();
		for (const e of db.enums) {
			const entry = byName.get(e.name) ?? {
				values: new Set<string>(),
				schemas: [],
			};
			for (const v of e.values) entry.values.add(v);
			entry.schemas.push(e.schema);
			byName.set(e.name, entry);
		}
		const entries = [...byName].map(([name, { values, schemas }]) => {
			const notes =
				comments && schemas.length > 1
					? doc(
							[
								`Enums of the same name in ${schemas.map((s) => `\`${s}\``).join(", ")}.`,
							],
							"    ",
						)
					: "";
			return `${notes}    ${key(name)}: ${[...values].map(str).join(" | ") || "never"};`;
		});
		lines.push(`  $types: {\n${entries.join("\n")}\n  };`);
	}

	const helpers = [
		"Col",
		"Generated",
		"Json",
		"Nullable",
		"NullableGenerated",
		"View",
	].filter((h) => used.has(h));
	const out = [
		`// Generated by \`typesql introspect\` from PostgreSQL ${db.version.split(/[.\s]/)[0]}. Do not edit.`,
		...(helpers.length > 0
			? [
					`import type { ${helpers.join(", ")} } from ${str(options.importFrom ?? "@typesql/core/postgres")};`,
				]
			: []),
		...(options.imports ?? []),
		"",
		`export interface ${key(typeName)} {`,
		...lines,
		"}",
		"",
	];
	const unknownKeys = Object.keys(columnTypes).filter((k) => !usedKeys.has(k));
	if (unknownKeys.length > 0 && options.column === undefined) {
		throw new Error(
			`columnTypes: no column ${unknownKeys.map((k) => JSON.stringify(k)).join(", ")} (keys are "table.column" for public tables, else "schema.table.column")`,
		);
	}
	return out.join("\n");
}
