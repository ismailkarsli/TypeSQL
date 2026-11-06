import type {
	CallExpression,
	Identifier,
	Node,
	PropertyAccessExpression,
	SourceFile,
	TemplateExpression,
} from "typescript/ast";
import type { Checker, Type } from "typescript/async";
import { DIALECTS, type Dialect } from "./sql/dialect.js";

export interface EditorKinds {
	readonly Identifier: number;
	readonly CallExpression: number;
	readonly PropertyAccessExpression: number;
	readonly StringLiteral: number;
	readonly NoSubstitutionTemplateLiteral: number;
	readonly TemplateExpression: number;
}

export function editorKinds(
	syntaxKind: Readonly<Record<string, number | string>>,
): EditorKinds {
	const k = (name: keyof EditorKinds): number => {
		const v = syntaxKind[name];
		if (typeof v !== "number")
			throw new Error(`typesql: SyntaxKind.${name} is missing`);
		return v;
	};
	return {
		Identifier: k("Identifier"),
		CallExpression: k("CallExpression"),
		PropertyAccessExpression: k("PropertyAccessExpression"),
		StringLiteral: k("StringLiteral"),
		NoSubstitutionTemplateLiteral: k("NoSubstitutionTemplateLiteral"),
		TemplateExpression: k("TemplateExpression"),
	};
}

interface SqlType {
	/** The index of the schema among the type's type arguments. */
	readonly db: number;
	/** Whether the first type argument is the engine. */
	readonly generic: boolean;
	/** Methods whose first argument is SQL. */
	readonly methods: readonly string[];
}

const SQL_METHODS = ["as", "fragment", "prepare", "raw"];
const sql: SqlType = { db: 0, generic: false, methods: SQL_METHODS };

/** The core types whose call takes SQL. */
const SQL_TYPES: ReadonlyMap<string, SqlType> = new Map([
	["Sql", sql],
	["TransactionalSql", sql],
	["MariaDbSql", sql],
	["MariaDbTransactionalSql", sql],
	// In core 7.0, createSql(dialect).withPlugin(…) returns SqlApi<Engine, DB, …>.
	["SqlApi", { db: 1, generic: true, methods: SQL_METHODS }],
	[
		"MigrationContext",
		{ db: 2, generic: true, methods: [...SQL_METHODS, "ddl", "add"] },
	],
]);

const METHODS: ReadonlySet<string> = new Set(
	[...SQL_TYPES.values()].flatMap((t) => t.methods),
);

/**
 * The node whose type decides whether `call` takes SQL: the receiver of a
 * method that takes SQL, else the callee.
 */
export function calleeOf(
	call: CallExpression,
	kinds: EditorKinds,
): { readonly node: Node; readonly method: string | null } {
	const callee = call.expression;
	return isPropertyAccess(callee, kinds) && METHODS.has(callee.name.text)
		? { node: callee.expression, method: callee.name.text }
		: { node: callee, method: null };
}

/** The core type `t` names, when a call of it, or of its `method`, takes SQL. */
export async function sqlTypeOf(
	t: Type,
	method: string | null,
	isCorePath: (path: string) => boolean,
): Promise<SqlType | null> {
	if (!t.isTypeReference()) return null;
	const sym = await t.getSymbol();
	const entry = sym ? SQL_TYPES.get(sym.name) : undefined;
	if (
		!entry ||
		(method !== null && !entry.methods.includes(method)) ||
		!sym!.declarations.some((d) => isCorePath(d.path))
	)
		return null;
	return entry;
}

/** The schema and dialect of a type that takes SQL. */
export async function targetOf(
	checker: Checker,
	t: Type,
	entry: SqlType,
): Promise<{ db: Type; dialect: Dialect } | null> {
	if (!t.isTypeReference()) return null;
	const db = (await checker.getTypeArguments(t))[entry.db];
	return db ? { db, dialect: await dialectOf(checker, t, entry) } : null;
}

/** The dialect of each engine, the first type argument of the generic types. */
const ENGINES = new Map<string, Dialect>([
	["PgEngine", "postgres"],
	["SqliteEngine", "sqlite"],
	["MySqlEngine", "mysql"],
	["MariaDbEngine", "mariadb"],
]);

const isDialect = (name: string): name is Dialect =>
	Object.hasOwn(DIALECTS, name);

/**
 * The dialect of a core type that takes SQL: its `dialect` property, which
 * each dialect's Sql has, or the engine type argument of the generic types
 * (SqlApi, MigrationContext).
 */
export async function dialectOf(
	checker: Checker,
	t: Type,
	entry: SqlType,
): Promise<Dialect> {
	const own = await checker.getTypeOfPropertyOfType(t, "dialect");
	if (own?.isStringLiteralType() && isDialect(own.value)) return own.value;
	if (!entry.generic || !t.isTypeReference()) return "postgres";
	const [engine] = await checker.getTypeArguments(t);
	const name = engine ? (await engine.getSymbol())?.name : undefined;
	return (name && ENGINES.get(name)) || "postgres";
}

export const isCall = (n: Node, kinds: EditorKinds): n is CallExpression =>
	n.kind === kinds.CallExpression;

export const isPropertyAccess = (
	n: Node,
	kinds: EditorKinds,
): n is PropertyAccessExpression => n.kind === kinds.PropertyAccessExpression;

export const isIdentifier = (n: Node, kinds: EditorKinds): n is Identifier =>
	n.kind === kinds.Identifier;

const isTemplate = (n: Node, kinds: EditorKinds): n is TemplateExpression =>
	n.kind === kinds.TemplateExpression;

export const isSqlLiteral = (
	n: Node | undefined,
	kinds: EditorKinds,
): n is Node =>
	n !== undefined &&
	(n.kind === kinds.StringLiteral ||
		n.kind === kinds.NoSubstitutionTemplateLiteral ||
		n.kind === kinds.TemplateExpression);

/** A SQL literal's source span and text, with each `${…}` hole as `[start, end)`. */
export interface LiteralText {
	readonly start: number;
	readonly end: number;
	readonly text: string;
	readonly holes: [number, number][];
}

/**
 * The SQL of a string literal, at the same offsets as its source: each
 * escape keeps its length, and each `${…}` hole reads as `$0`.
 */
export function textOf(
	file: SourceFile,
	literal: Node,
	kinds: EditorKinds,
): LiteralText {
	const src = file.text;
	const open = literal.getStart(file);
	const quote = src[open];
	const start = open + 1;
	let end = literal.end;
	if (end - 1 > open && src[end - 1] === quote && !escaped(src, end - 1)) end--;
	const holes: [number, number][] = [];
	if (isTemplate(literal, kinds)) {
		let prev: Node = literal.head;
		for (const span of literal.templateSpans) {
			holes.push([prev.end - 2, span.literal.getStart(file) + 1]);
			prev = span.literal;
		}
	}
	let text = "";
	let i = start;
	for (const [s, e] of [...holes, [end, end] satisfies [number, number]]) {
		text += escapes(src.slice(i, s));
		if (e > s) text += "$0".padEnd(e - s, " ");
		i = e;
	}
	return { start, end, text, holes };
}

function escaped(s: string, i: number): boolean {
	let n = 0;
	while (s[i - n - 1] === "\\") n++;
	return n % 2 === 1;
}

// Replace each escape with two characters to keep offsets. An escaped quote
// keeps its quote and gets a space outside the SQL quote it opens or closes,
// so `\"Users\"` reads as ` "Users" `, not ` "Users "`. A run of n escaped
// backslashes becomes n spaces and then the n backslashes, so the last
// escapes what follows it in a string that takes backslash escapes.
const escapes = (s: string): string => {
	const open = new Set<string>();
	return s.replace(/(?:\\\\)+|\\(.)/gs, (m, c: string | undefined) => {
		if (c === undefined)
			return " ".repeat(m.length / 2) + "\\".repeat(m.length / 2);
		if (c !== '"' && c !== "'" && c !== "`") return "  ";
		if (open.delete(c)) return `${c} `;
		open.add(c);
		return ` ${c}`;
	});
};
