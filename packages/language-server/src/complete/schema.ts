import type { Checker, Symbol as TsSymbol, Type } from "typescript/async";
import type { RelRef } from "./scan.js";

export interface Relation {
	readonly schema: string | null;
	readonly name: string;
	readonly view: boolean;
}

export interface Column {
	readonly name: string;
	readonly type: string;
	readonly nullable: boolean;
}

export interface Schema {
	relations(schema: string | null): Promise<readonly Relation[]>;
	readonly namespaces: readonly string[];
	columns(ref: RelRef): Promise<readonly Column[] | null>;
}

const NOT_RELATIONS = new Set(["$types", "$functions"]);

interface Entry {
	readonly name: string;
	readonly type: Type;
}

export function schemaOf(
	checker: Checker,
	db: Type,
	caseInsensitive = false,
): Promise<Schema> {
	return read(checker, db, caseInsensitive);
}

async function read(checker: Checker, db: Type, ci: boolean): Promise<Schema> {
	const norm = (name: string): string => (ci ? name.toLowerCase() : name);
	const entries = async (t: Type): Promise<Entry[]> => {
		const props = (await checker.getPropertiesOfType(t)).filter(
			(p) => !NOT_RELATIONS.has(p.name),
		);
		if (!props.length) return [];
		const types = await checker.getTypeOfSymbol(props as TsSymbol[]);
		return props.map((p, i) => ({ name: p.name, type: types[i]! }));
	};
	const classify = async (
		t: Type,
	): Promise<"view" | "table" | "namespace" | null> => {
		if (!t.isObjectType() && !t.isIntersectionType()) return null;
		if (await checker.getPropertyOfType(t, "$view")) return "view";
		const props = await checker.getPropertiesOfType(t);
		const first = props[0];
		if (!first) return "table";
		const ft = await checker.getTypeOfSymbol(first);
		return (await checker.getPropertyOfType(ft, "type"))
			? "table"
			: "namespace";
	};

	const top = await entries(db);
	const kinds = await Promise.all(top.map((e) => classify(e.type)));
	const relations: Relation[] = [];
	const relTypes = new Map<string, Type>();
	const namespaces = new Map<string, Type>();
	top.forEach((e, i) => {
		const k = kinds[i];
		if (k === "view" || k === "table") {
			relations.push({ schema: null, name: e.name, view: k === "view" });
			relTypes.set(norm(e.name), e.type);
		} else if (k === "namespace") namespaces.set(norm(e.name), e.type);
	});

	const namespace = async (
		ns: string,
	): Promise<{ relations: Relation[]; types: Map<string, Type> }> => {
		const t = namespaces.get(ns);
		const rels: Relation[] = [];
		const types = new Map<string, Type>();
		if (!t) return { relations: rels, types };
		const es = await entries(t);
		const views = await Promise.all(
			es.map((e) => checker.getPropertyOfType(e.type, "$view")),
		);
		es.forEach((e, i) => {
			rels.push({ schema: ns, name: e.name, view: !!views[i] });
			types.set(norm(e.name), e.type);
		});
		return { relations: rels, types };
	};

	const columnsOf = async (t: Type): Promise<Column[]> => {
		const view = await checker.getPropertyOfType(t, "$view");
		const table = view ? await checker.getTypeOfSymbol(view) : t;
		const es = await entries(table);
		return Promise.all(
			es.map(async (e): Promise<Column> => {
				const [type, nullable] = await Promise.all([
					checker.getTypeOfPropertyOfType(e.type, "type"),
					checker.getTypeOfPropertyOfType(e.type, "nullable"),
				]);
				return {
					name: e.name,
					type: type ? await typeName(checker, type) : "unknown",
					nullable:
						!!nullable?.isBooleanLiteralType() && nullable.value === true,
				};
			}),
		);
	};

	return {
		namespaces: [...namespaces.keys()],
		async relations(schema) {
			if (schema === null || (!ci && schema === "public")) return relations;
			return (await namespace(norm(schema))).relations;
		},
		async columns(ref) {
			const name = norm(ref.name);
			if (
				ref.schema === null ||
				(ci ? ["main", "temp"] : ["public"]).includes(norm(ref.schema))
			) {
				const t =
					relTypes.get(name) ??
					(ref.schema === null && !ci
						? (await namespace("pg_catalog")).types.get(name)
						: undefined);
				return t ? columnsOf(t) : null;
			}
			const t = (await namespace(norm(ref.schema))).types.get(name);
			return t ? columnsOf(t) : null;
		},
	};
}

async function typeName(checker: Checker, t: Type): Promise<string> {
	if (t.isStringLiteralType()) return t.value;
	if (t.isIntersectionType()) {
		const lit = (await t.getTypes()).find((m) => m.isStringLiteralType());
		if (lit?.isStringLiteralType()) return lit.value;
	}
	return checker.typeToString(t);
}
