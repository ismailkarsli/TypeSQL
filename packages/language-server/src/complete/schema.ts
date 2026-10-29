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

const memo = new WeakMap<Checker, Map<number, Promise<Schema>>>();

export function schemaOf(checker: Checker, db: Type): Promise<Schema> {
	let byType = memo.get(checker);
	if (!byType) {
		byType = new Map();
		memo.set(checker, byType);
	}
	let s = byType.get(db.id);
	if (!s) {
		s = read(checker, db);
		byType.set(db.id, s);
	}
	return s;
}

async function read(checker: Checker, db: Type): Promise<Schema> {
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
			relTypes.set(e.name, e.type);
		} else if (k === "namespace") namespaces.set(e.name, e.type);
	});

	const inNs = new Map<
		string,
		Promise<{ relations: Relation[]; types: Map<string, Type> }>
	>();
	const namespace = (
		ns: string,
	): Promise<{ relations: Relation[]; types: Map<string, Type> }> => {
		let v = inNs.get(ns);
		if (!v) {
			v = (async () => {
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
					types.set(e.name, e.type);
				});
				return { relations: rels, types };
			})();
			inNs.set(ns, v);
		}
		return v;
	};

	const cols = new Map<number, Promise<Column[]>>();
	const columnsOf = (t: Type): Promise<Column[]> => {
		let v = cols.get(t.id);
		if (!v) {
			v = (async () => {
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
			})();
			cols.set(t.id, v);
		}
		return v;
	};

	return {
		namespaces: [...namespaces.keys()],
		async relations(schema) {
			if (schema === null || schema === "public") return relations;
			return (await namespace(schema)).relations;
		},
		async columns(ref) {
			if (ref.schema === null || ref.schema === "public") {
				const t =
					relTypes.get(ref.name) ??
					(ref.schema === null
						? (await namespace("pg_catalog")).types.get(ref.name)
						: undefined);
				return t ? columnsOf(t) : null;
			}
			const t = (await namespace(ref.schema)).types.get(ref.name);
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
