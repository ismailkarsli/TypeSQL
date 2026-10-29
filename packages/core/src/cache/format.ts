import { createHash } from "node:crypto";

export const FORMAT = 1;

export interface CacheFile {
	readonly typesqlcache: typeof FORMAT;
	readonly engine: string;
	readonly groups: { readonly [group: string]: Group };
	readonly maps: { readonly [map: string]: string };
	readonly ddl: { readonly [key: string]: readonly DdlEntry[] };
	readonly owners: { readonly [entry: string]: readonly string[] };
}

export interface Snapshot {
	readonly t: string;
	readonly w: {
		readonly [word: string]: readonly [string, string, string, string];
	};
	readonly q: { readonly [pair: string]: string };
}

export interface Group extends Snapshot {
	readonly h: string;
	readonly entries: { readonly [key: string]: Entry };
}

export interface Entry {
	readonly r: readonly string[];
	readonly t?: string;
	readonly a?: string;
	readonly c?: readonly CallEntry[];
}

export interface CallEntry {
	readonly m: string;
	readonly k: string;
	readonly g: string;
	readonly p: string;
	readonly q: string;
}

export interface DdlEntry {
	readonly d: Snapshot & { readonly all?: string };
	readonly r: readonly string[];
	readonly s?: string;
	readonly x?: string;
	readonly e?: string;
}

export const emptyCache = (engine: string): CacheFile => ({
	typesqlcache: FORMAT,
	engine,
	groups: {},
	maps: {},
	ddl: {},
	owners: {},
});

export function parseCache(text: string): CacheFile | null {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof data !== "object" || data === null) return null;
	const f = data as Partial<CacheFile>;
	if (f.typesqlcache !== FORMAT || typeof f.engine !== "string") return null;
	return {
		typesqlcache: FORMAT,
		engine: f.engine,
		groups: f.groups ?? {},
		maps: f.maps ?? {},
		ddl: f.ddl ?? {},
		owners: f.owners ?? {},
	};
}

const sorted = (v: unknown): unknown => {
	if (Array.isArray(v)) return v.map(sorted);
	if (v && typeof v === "object")
		return Object.fromEntries(
			Object.keys(v)
				.sort()
				.map((k) => [k, sorted((v as Record<string, unknown>)[k])]),
		);
	return v;
};

export const stringifyCache = (file: CacheFile): string =>
	JSON.stringify(sorted(file), null, 1) + "\n";

export const canonical = (v: unknown): string => JSON.stringify(sorted(v));

export const hash = (text: string, length = 12): string =>
	createHash("sha256").update(text).digest("hex").slice(0, length);

const lit = (s: string): string => JSON.stringify(s);
const union = (xs: readonly string[]): string =>
	xs.length ? xs.map(lit).join(" | ") : "never";
const words = (w: Snapshot["w"]): string =>
	`{ ${Object.entries(w)
		.map(([k, v]) => `${lit(k)}: readonly [${v.join(", ")}]`)
		.join("; ")} }`;
const pairs = (q: Snapshot["q"]): string =>
	`{ ${Object.entries(q)
		.map(([k, v]) => `${lit(k)}: ${v}`)
		.join("; ")} }`;

export function render(
	file: CacheFile | null,
	id: string,
	engine: string,
): string {
	const head = `// Generated from a TypeSQL type cache; see https://typesql.karsli.net/guide/caching\nimport type * as __T from "@typesql/core/engine";\nexport {};\n`;
	if (!file || file.engine !== engine) return head;
	const out: string[] = [head];
	const keys = new Set<string>();
	const snapshots: string[] = [];
	const groups: string[] = [];
	for (const [g, group] of Object.entries(file.groups)) {
		const entries = Object.entries(group.entries);
		if (!entries.length) continue;
		const calls = Object.groupBy(
			entries.flatMap(([text, e]) => (e.c ?? []).map((c) => ({ text, ...c }))),
			(c) => `${c.m}#${c.k}`,
		);
		for (const [key, cs] of Object.entries(calls))
			snapshots.push(
				`    ${lit(`${id}#${g}#${key}`)}: D_${g} & { m: M_${cs![0]!.m}; k: ${cs![0]!.k}; c: {${cs!.map((c) => `${lit(c.text)}: { m: M_${c.m}; k: ${c.k}; g: ${c.g}; p: ${c.p}; q: ${c.q} };`).join(" ")} } };`,
			);
		out.push(
			`type D_${g} = { v: ${lit(file.engine)}; t: ${group.t}; w: ${words(group.w)}; q: ${pairs(group.q)}; h: ${group.h} };\n`,
		);
		snapshots.push(`    ${lit(`${id}#${g}`)}: D_${g};`);
		const body = entries.map(([key, e]) => {
			keys.add(key);
			const calls = e.c?.length
				? `; c: ${e.c.map((c) => `{ m: M_${c.m}; k: ${c.k}; g: ${c.g}; p: ${c.p}; q: ${c.q} }`).join(" | ")}`
				: "";
			return `      ${lit(key)}: { r: ${union(e.r)}${e.a ? `; a: ${e.a}` : ""}${calls} };`;
		});
		groups.push(`    ${lit(`${id}#${g}`)}: {\n${body.join("\n")}\n    };`);
	}
	for (const [m, text] of Object.entries(file.maps))
		out.push(`type M_${m} = ${text};\n`);
	const ddl = Object.entries(file.ddl).filter(([, es]) => es.length);
	const ddlBody = ddl.map(([key, es]) => {
		const variants = es.map((e) => {
			const d = `{ v: ${lit(file.engine)}; t: ${e.d.t}; w: ${words(e.d.w)}; q: ${pairs(e.d.q)}${e.d.all ? `; all: ${e.d.all}` : ""} }`;
			return `{ d: ${d}; r: ${union(e.r)}; ${e.e ? `e: ${e.e}` : `s: ${e.s}; x: ${e.x}`} }`;
		});
		return `      ${lit(key)}: ${variants.join(" | ")};`;
	});
	out.push(`declare module "@typesql/core/engine" {\n`);
	if (keys.size) {
		out.push(
			`  interface QueryCacheKeys {\n${[...keys].map((k) => `    ${lit(k)}: true;`).join("\n")}\n  }\n`,
		);
		out.push(`  interface CacheSnapshots {\n${snapshots.join("\n")}\n  }\n`);
		out.push(`  interface QueryCache {\n${groups.join("\n")}\n  }\n`);
	}
	if (ddl.length) {
		out.push(
			`  interface DdlCacheKeys {\n${ddl.map(([k]) => `    ${lit(k)}: true;`).join("\n")}\n  }\n`,
		);
		out.push(
			`  interface DdlCache {\n    ${lit(id)}: {\n${ddlBody.join("\n")}\n    };\n  }\n`,
		);
	}
	out.push(`}\n`);
	return out.join("");
}

export const fileId = (fileName: string): string => hash(fileName, 8);
