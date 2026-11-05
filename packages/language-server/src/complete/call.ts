import type {
	CallExpression,
	Identifier,
	LineAndCharacter,
	Node,
	PropertyAccessExpression,
	SourceFile,
	TemplateExpression,
} from "typescript/ast";
import type {
	Checker,
	DocumentIdentifier,
	Program,
	Type,
} from "typescript/async";

export interface EditorKinds {
	readonly Identifier: number;
	readonly CallExpression: number;
	readonly PropertyAccessExpression: number;
	readonly StringLiteral: number;
	readonly NoSubstitutionTemplateLiteral: number;
	readonly TemplateExpression: number;
}

export interface SqlCall {
	readonly file: SourceFile;
	readonly offset: number;
	readonly start: number;
	readonly end: number;
	readonly text: string;
	/** The TypeScript literal's delimiter: `"`, `'` or a backtick. */
	readonly quote: string;
	readonly db: Type;
	readonly dialect: Dialect;
}

export type Dialect = "postgres" | "sqlite" | "mysql" | "mariadb";

/** MySQL and MariaDB: backtick identifiers, `#` comments, backslash escapes. */
export const isMySql = (d: Dialect): boolean =>
	d === "mysql" || d === "mariadb";

const METHODS = new Set(["fragment", "as"]);

export async function sqlCallAt(
	program: Program,
	checker: Checker,
	kinds: EditorKinds,
	document: DocumentIdentifier,
	at: number | LineAndCharacter,
	isCorePath: (path: string) => boolean,
): Promise<SqlCall | null> {
	const file = await program.getSourceFile(document);
	if (!file) return null;
	const offset =
		typeof at === "number"
			? at
			: file.getPositionOfLineAndCharacter(at.line, at.character);
	const call = callAt(file, offset, kinds);
	if (!call) return null;
	const literal = call.arguments[0]!;
	let parts = textOf(file, literal, kinds);
	if (
		offset < parts.start ||
		offset > parts.end ||
		parts.holes.some(([s, e]) => offset > s && offset < e)
	)
		return null;

	const callee = call.expression;
	const sqlType = await checker.getTypeAtLocation(
		isPropertyAccess(callee, kinds) && METHODS.has(callee.name.text)
			? callee.expression
			: callee,
	);
	const target = await sqlTarget(checker, sqlType, isCorePath);
	if (!target) return null;
	if (isMySql(target.dialect))
		parts = textOf(file, literal, kinds, target.dialect);
	return {
		file,
		offset,
		start: parts.start,
		end: parts.end,
		text: parts.text,
		quote: file.text[literal.getStart(file)]!,
		...target,
	};
}

async function sqlTarget(
	checker: Checker,
	t: Type,
	isCorePath: (path: string) => boolean,
): Promise<{ db: Type; dialect: Dialect } | null> {
	if (!t.isTypeReference()) return null;
	// core's createSql(dialect).withPlugin(…) returns SqlApi<Engine, DB, …>.
	const index = (await isCoreRef(t, SQL_TYPES, isCorePath))
		? 0
		: (await isCoreRef(t, ["SqlApi"], isCorePath))
			? 1
			: -1;
	if (index < 0) return null;
	const db = (await checker.getTypeArguments(t))[index];
	return db ? { db, dialect: await dialectOf(checker, t) } : null;
}

const SQL_TYPES = [
	"Sql",
	"TransactionalSql",
	"MariaDbSql",
	"MariaDbTransactionalSql",
];

const DIALECTS: ReadonlySet<string> = new Set<Dialect>([
	"postgres",
	"sqlite",
	"mysql",
	"mariadb",
]);

const isDialect = (name: string): name is Dialect => DIALECTS.has(name);

// Shared generic types whose first type argument is the engine or dialect.
const GENERIC = new Set(["SqlApi", "MigrationContext", "Migrations"]);

const ENGINES = new Map<string, Dialect>([
	["PgEngine", "postgres"],
	["SqliteEngine", "sqlite"],
	["MySqlEngine", "mysql"],
	["MariaDbEngine", "mariadb"],
	["Postgres", "postgres"],
	["Sqlite", "sqlite"],
	["MySql", "mysql"],
	["MariaDb", "mariadb"],
]);

/**
 * The dialect of a core type that takes SQL: by its `dialect` property when
 * the type names one (each dialect's Sql does), else by its name for MariaDB's
 * own types, by its engine or dialect type argument for the shared generic
 * types (SqlApi, MigrationContext, Migrations), else by the dialect folder
 * that declares it.
 */
export async function dialectOf(checker: Checker, t: Type): Promise<Dialect> {
	const own = await checker.getTypeOfPropertyOfType(t, "dialect");
	if (own?.isStringLiteralType() && isDialect(own.value)) return own.value;
	const sym = await t.getSymbol();
	if (!sym) return "postgres";
	if (sym.name.startsWith("MariaDb")) return "mariadb";
	if (GENERIC.has(sym.name) && t.isTypeReference()) {
		const [first] = await checker.getTypeArguments(t);
		const name = first ? (await first.getSymbol())?.name : undefined;
		return (name && ENGINES.get(name)) || "postgres";
	}
	const path = sym.declarations.map((d) => d.path).join("\n");
	return /[\\/](?:src|dist)[\\/]mysql[\\/]/.test(path)
		? "mysql"
		: /[\\/](?:src|dist)[\\/]sqlite[\\/]/.test(path)
			? "sqlite"
			: "postgres";
}

function callAt(
	file: SourceFile,
	offset: number,
	kinds: EditorKinds,
): CallExpression | null {
	let found: CallExpression | null = null;
	const visit = (n: Node): void => {
		if (offset < n.pos || offset > n.end) return;
		if (isCall(n, kinds) && isSqlLiteral(n.arguments[0], kinds)) found = n;
		n.forEachChild(visit);
	};
	visit(file);
	return found;
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

export function textOf(
	file: SourceFile,
	literal: Node,
	kinds: EditorKinds,
	dialect: Dialect = "postgres",
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
		text += escapes(src.slice(i, s), isMySql(dialect));
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
// so `\"Users\"` reads as ` "Users" `, not ` "Users "`. For MySQL, whose
// strings take backslash escapes, a run of n escaped backslashes becomes n
// spaces and then the n backslashes, so the last escapes what follows it.
const escapes = (s: string, backslashes = false): string => {
	const open = new Set<string>();
	return s.replace(/(?:\\\\)+|\\(.)/gs, (m, c: string | undefined) => {
		if (c === undefined)
			return backslashes
				? " ".repeat(m.length / 2) + "\\".repeat(m.length / 2)
				: " ".repeat(m.length);
		if (c !== '"' && c !== "'" && c !== "`") return "  ";
		if (open.delete(c)) return `${c} `;
		open.add(c);
		return ` ${c}`;
	});
};

export async function isCoreRef(
	type: Type,
	names: readonly string[],
	isCorePath: (path: string) => boolean,
): Promise<boolean> {
	if (!type.isTypeReference()) return false;
	const sym = await type.getSymbol();
	return (
		!!sym &&
		names.includes(sym.name) &&
		sym.declarations.some((d) => isCorePath(d.path))
	);
}
