import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import {
	type BaselineEntry,
	type Entries,
	hashOf,
	preview,
} from "../oracle/baseline.js";
import {
	badDeclarations,
	declarations,
	ProbeSession,
} from "../support/evaluate.js";

const here = import.meta.dirname;

export interface Corpus {
	readonly schemas: Readonly<Record<string, string>>;
	readonly statements: readonly {
		readonly schema: string;
		readonly source: string;
		readonly sql: string;
	}[];
}

export function readCorpus(): Corpus {
	return JSON.parse(readFileSync(join(here, "corpus.json"), "utf8")) as Corpus;
}

interface Cell {
	readonly name: string;
	readonly types: readonly string[];
	readonly nullable: boolean;
}
type Ours =
	| { readonly ok: false; readonly message: string }
	| {
			readonly ok: true;
			readonly cells: readonly Cell[];
			readonly params: readonly (readonly string[])[];
	  }
	| { readonly crash: string };

function parseView(text: string): Ours {
	if (text.startsWith("E")) {
		const [message] = text.slice(1).split("\u0003");
		return { ok: false, message: message ?? "" };
	}
	if (!text.startsWith("R")) return { crash: `unreadable analysis: ${text}` };
	const [cols = "", params = ""] = text.slice(1).split("\u0003");
	const cells = cols
		? cols.split("\u0001").map((c) => {
				const [name = "", types = "", n = ""] = c.split("\u0002");
				return { name, types: types.split("|"), nullable: n === "1" };
			})
		: [];
	return {
		ok: true,
		cells,
		params: params
			? params.split("\u0001").map((p) => (p ? p.split(",") : []))
			: [],
	};
}

const affinity = (t: string): string => {
	if (t === "null" || t === "unknown" || t === "any") return t;
	if (t.includes("int")) return "integer";
	if (/char|clob|text/.test(t)) return "text";
	if (t.includes("blob")) return "blob";
	if (/real|floa|doub/.test(t)) return "real";
	return t === "" ? "any" : "numeric";
};
const STRINGY = new Set([
	"date",
	"datetime",
	"time",
	"timestamp",
	"json",
	"uuid",
]);

function fits(value: unknown, types: readonly string[]): boolean {
	return types.some((t) => {
		if (t === "any" || t === "unknown") return true;
		if (t === "null") return value === null;
		if (STRINGY.has(t)) return typeof value === "string";
		switch (affinity(t)) {
			case "integer":
			case "real":
			case "numeric":
				return typeof value === "number" || typeof value === "bigint";
			case "text":
				return typeof value === "string";
			case "blob":
				return value instanceof Uint8Array;
			default:
				return true;
		}
	});
}

function sample(uses: readonly string[]): unknown {
	const nullable = uses.some((u) => u.endsWith("?"));
	const first = uses.find((u) => u !== "?")?.replace(/\?$/, "") ?? "";
	const t = first.split("|")[0] ?? "";
	if (!t || t === "unknown" || t === "any") return nullable ? null : 1;
	if (STRINGY.has(t)) return t === "json" ? '{"a":1}' : "2024-01-01 10:00:00";
	switch (affinity(t)) {
		case "integer":
		case "numeric":
			return 1;
		case "real":
			return 1.5;
		case "text":
			return "a";
		case "blob":
			return new Uint8Array([1]);
		default:
			return null;
	}
}

function seedValue(
	type: string,
	pk: boolean,
	row: number,
	name: string,
): string {
	const t = type.toLowerCase();
	if (pk || /(^|_)id$/.test(name)) return String(row + 1);
	if (STRINGY.has(t.replace(/\(.*$/, "").trim()))
		return t.startsWith("json")
			? `'{"a":${row},"b":[1,2],"s":"x"}'`
			: `'2024-01-0${row + 1} 10:00:00'`;
	if (t === "boolean" || t === "bool") return String(row % 2);
	switch (affinity(t.replace(/\(.*$/, "").trim())) {
		case "integer":
			return String([1, 0, -1][row] ?? row);
		case "real":
			return String([1.5, 0, -2.25][row] ?? row);
		case "numeric":
			return String([10, 0.5, 3][row] ?? row);
		case "text":
			return `'${["a", "b", ""][row] ?? "x"}'`;
		case "blob":
			return `x'${["00", "0102", ""][row] ?? "ff"}'`;
		default:
			return String([1, "'x'", 2.5][row] ?? 1);
	}
}

function openSchema(ddl: string): DatabaseSync | string {
	const db = new DatabaseSync(":memory:");
	try {
		db.exec(ddl);
	} catch (e) {
		return (e as Error).message;
	}
	const tables = db
		.prepare(
			"SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE 'CREATE VIRTUAL%'",
		)
		.all() as { name: string }[];
	for (const { name } of tables) {
		const cols = db
			.prepare(
				`SELECT name, type, "notnull", pk FROM pragma_table_xinfo(?) WHERE hidden = 0`,
			)
			.all(name) as {
			name: string;
			type: string;
			notnull: number;
			pk: number;
		}[];
		for (let row = 0; row < 3; row++) {
			const values = cols.map((c) =>
				row === 2 && !c.notnull && !c.pk
					? "NULL"
					: seedValue(c.type, c.pk > 0, row, c.name),
			);
			try {
				db.exec(
					`INSERT INTO "${name}" (${cols.map((c) => `"${c.name}"`).join(", ")}) VALUES (${values.join(", ")})`,
				);
			} catch {}
		}
	}
	return db;
}

const PARAMS =
	/'(?:[^']|'')*'|"(?:[^"]|"")*"|--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|\$(\d+)/g;

function named(
	text: string,
	args: readonly unknown[],
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const m of text.matchAll(PARAMS))
		if (m[1] !== undefined) out[`$${m[1]}`] = args[Number(m[1]) - 1] ?? null;
	return out;
}

interface Theirs {
	readonly error?: string;
	readonly names?: readonly string[];
	readonly decltypes?: readonly (string | null)[];
	readonly rows?: readonly (readonly unknown[])[];
	readonly runError?: string;
}

function runSqlite(db: DatabaseSync, text: string, ours: Ours): Theirs {
	let stmt: StatementSync;
	try {
		stmt = db.prepare(text);
	} catch (e) {
		return { error: (e as Error).message };
	}
	const cols = stmt.columns();
	const names = cols.map((c) => c.name);
	const decltypes = cols.map((c) => c.type ?? null);
	const args = "ok" in ours && ours.ok ? ours.params.map(sample) : [];
	if (/^\s*(begin|commit|end|rollback|savepoint|release)\b/i.test(text))
		return { names, decltypes, rows: [] };
	db.exec("SAVEPOINT oracle");
	try {
		stmt.setReturnArrays(true);
		const rows = stmt.all(named(text, args) as never) as unknown as unknown[][];
		return { names, decltypes, rows };
	} catch (e) {
		return { names, decltypes, runError: (e as Error).message };
	} finally {
		db.exec("ROLLBACK TO oracle; RELEASE oracle");
	}
}

const normType = (t: string): string =>
	t.toLowerCase().replace(/\(.*$/, "").replace(/\s+/g, " ").trim() || "any";

export interface Disagreement {
	readonly kind:
		| "accepts"
		| "rejects"
		| "message"
		| "names"
		| "decltype"
		| "unsound"
		| "crash"
		| "schema";
	readonly detail: string;
}

const NAMED_ERROR = /^(ambiguous column name|no such column): /;

function sameError(withHint: string, theirs: string): boolean {
	const ours = withHint.replace(/\. Perhaps you meant the \w+ "[^"]*"\?$/, "");
	if (ours === theirs) return true;
	const a = NAMED_ERROR.exec(ours)?.[1];
	return a !== undefined && a === NAMED_ERROR.exec(theirs)?.[1];
}

function compare(text: string, ours: Ours, theirs: Theirs): Disagreement[] {
	if ("crash" in ours) return [{ kind: "crash", detail: ours.crash }];
	if (theirs.error !== undefined) {
		if (ours.ok)
			return [{ kind: "accepts", detail: `SQLite: ${theirs.error}` }];
		return sameError(ours.message, theirs.error)
			? []
			: [
					{
						kind: "message",
						detail: `ours: ${ours.message} | SQLite: ${theirs.error}`,
					},
				];
	}
	if (!ours.ok) return [{ kind: "rejects", detail: `ours: ${ours.message}` }];
	const out: Disagreement[] = [];
	const names = theirs.names ?? [];
	const isDdl =
		/^\s*(create|alter|drop|begin|commit|end|rollback|pragma|vacuum|analyze|reindex|savepoint|release|attach|detach|explain)\b/i.test(
			text,
		);
	if (
		!isDdl &&
		names.join("\u0001") !== ours.cells.map((c) => c.name).join("\u0001")
	)
		out.push({
			kind: "names",
			detail: `ours: ${JSON.stringify(ours.cells.map((c) => c.name))} | SQLite: ${JSON.stringify(names)}`,
		});
	else
		ours.cells.forEach((c, i) => {
			const d = theirs.decltypes?.[i];
			if (d && c.types.length === 1 && normType(d) !== c.types[0])
				out.push({
					kind: "decltype",
					detail: `${c.name}: ours ${c.types.join("|")} | SQLite ${normType(d)}`,
				});
		});
	const bad = new Set<string>();
	for (const row of theirs.rows ?? [])
		ours.cells.forEach((c, i) => {
			const v = row[i];
			if (v === null && !c.nullable && !c.types.includes("null"))
				bad.add(`${c.name}: NULL for a NOT NULL column`);
			else if (v !== null && !fits(v, c.types))
				bad.add(
					`${c.name}: ${v instanceof Uint8Array ? "blob" : typeof v} for ${c.types.join("|")}`,
				);
		});
	for (const b of bad) out.push({ kind: "unsound", detail: b });
	return out;
}

export interface OracleResult {
	readonly entries: Entries;
	readonly tally: Record<string, number>;
}

export async function runOracle(
	log: (m: string) => void,
	corpus: Corpus = readCorpus(),
): Promise<OracleResult> {
	mkdirSync(join(here, ".probe"), { recursive: true });
	const session = new ProbeSession(
		join(here, "tsconfig.json"),
		join(here, ".probe/__oracle_probe__.ts"),
	);
	const ids = Object.keys(corpus.schemas);
	let probe = 'import type { Schema, SchemaView, View } from "../view.ts";\n';
	ids.forEach((id, k) => {
		const ddl = JSON.stringify(corpus.schemas[id]);
		probe += `type S${k} = Schema<${ddl}>;\nexport declare const s${k}: SchemaView<${ddl}>;\n`;
	});
	corpus.statements.forEach((st, i) => {
		probe += `export declare const q${i}: View<S${ids.indexOf(st.schema)}, ${JSON.stringify(st.sql)}>;\n`;
	});
	const started = performance.now();
	const entries: Entries = {};
	const tally: Record<string, number> = {};
	const add = (group: string, sql: string, d: Disagreement): void => {
		const e: BaselineEntry = {
			kind: d.kind,
			hash: hashOf(`${sql}\0${d.detail}`),
			sql: preview(sql, 200),
			detail: d.detail,
		};
		const list = entries[group] ?? [];
		list.push(e);
		entries[group] = list;
		tally[d.kind] = (tally[d.kind] ?? 0) + 1;
	};
	try {
		const { program, checker, sf } = await session.withProbe(probe);
		const kinds = (await session.typescript()).kinds;
		const decls = declarations(sf, kinds);
		const names = [...decls.keys()];
		const types = await checker.getTypeAtLocation(
			names.map((n) => decls.get(n)!),
		);
		const bad = await badDeclarations(program, sf);
		const value = new Map<string, Ours>();
		names.forEach((n, i) => {
			const t = types[i]!;
			const err = bad.get(n);
			value.set(
				n,
				err !== undefined
					? { crash: err }
					: t.isStringLiteralType()
						? parseView(String((t as unknown as { value: string }).value))
						: { crash: "not a literal" },
			);
		});
		log(
			`typesql: ${corpus.statements.length} statements in ${Math.round(performance.now() - started)} ms`,
		);
		const dbs = new Map<string, DatabaseSync | string>();
		ids.forEach((id, k) => {
			const db = openSchema(corpus.schemas[id]!);
			dbs.set(id, db);
			const ours = value.get(`s${k}`);
			const oursErr =
				ours && "ok" in ours && !ours.ok
					? ours.message
					: ours && "crash" in ours
						? ours.crash
						: null;
			const theirsErr = typeof db === "string" ? db : null;
			if (oursErr !== theirsErr)
				add(`schema:${id}`, corpus.schemas[id]!, {
					kind: "schema",
					detail: `ours: ${oursErr ?? "ok"} | SQLite: ${theirsErr ?? "ok"}`,
				});
		});
		corpus.statements.forEach((st, i) => {
			const db = dbs.get(st.schema);
			tally.statements = (tally.statements ?? 0) + 1;
			if (typeof db !== "object") return;
			const ours = value.get(`q${i}`)!;
			const theirs = runSqlite(db, st.sql, ours);
			for (const d of compare(st.sql, ours, theirs)) add(st.source, st.sql, d);
		});
		for (const db of dbs.values()) if (typeof db === "object") db.close();
	} finally {
		await session.dispose();
	}
	return { entries, tally };
}
