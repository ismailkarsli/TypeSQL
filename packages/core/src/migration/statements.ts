// The statements of a migration's scripts, as the migrator reads them: where
// one ends, and whether one controls the transaction the migrator owns.

import { LEXIS, scan } from "../runtime/compile.js";
import type { MigratorDialect } from "./dialects/session.js";

/** What the statements of a dialect's scripts are read by. */
type Rules = Pick<MigratorDialect, "sql" | "scan">;

/** A word, a `;`, or any other character of code. */
const CODE = /[a-zA-Z_][a-zA-Z_0-9$]*|;|\S/g;

const PUNCTUATION = new Set([";", "(", ")"]);

/**
 * Calls `on` for each token of `sql` outside whitespace and comments: an
 * uppercased word, ";", "(", ")", or "" for a quoted string, identifier, a
 * word that can only be a name, or any other character. `start` tells whether it begins a statement. Strings, quoted
 * names and comments are the dialect's lexis.
 */
function scanSql(
	sql: string,
	{ sql: dialect }: Rules,
	on: (token: string, end: number, start: boolean) => void,
): void {
	let start = true;
	// The next word is a name: `NEW.end`, `SELECT 1 AS end`.
	let name = false;
	const token = (text: string, end: number): void => {
		on(text, end, start);
		start = text === ";";
		name = false;
	};
	const code = (from: number, to: number): void => {
		for (const m of sql.slice(from, to).matchAll(CODE)) {
			const [text] = m;
			const word = /^\w/.test(text) && !name ? text.toUpperCase() : "";
			token(
				word || (PUNCTUATION.has(text) ? text : ""),
				from + m.index + text.length,
			);
			name = text === "." || word === "AS";
		}
	};
	let last = 0;
	scan(
		sql,
		(m) => {
			code(last, m.index);
			last = m.index + m[0].length;
			if (!/^(?:--|#|\/\*)/.test(m[0])) token("", last);
			return "";
		},
		dialect.lexis ?? LEXIS,
	);
	code(last, sql.length);
}

/** The kinds of object CREATE makes. */
const CREATE_KINDS = new Set([
	"TABLE",
	"VIEW",
	"INDEX",
	"DATABASE",
	"SCHEMA",
	"SEQUENCE",
	"USER",
	"ROLE",
	"SERVER",
	"TABLESPACE",
	"PACKAGE",
	"PROCEDURE",
	"FUNCTION",
	"TRIGGER",
	"EVENT",
]);

/** What a statement read so far is, as `;` and BEGIN … END nest in it. */
interface Statement {
	/** The first words since its start or its last `;`. */
	readonly words: string[];
	/** The kind of object a CREATE statement makes. */
	kind: string | undefined;
	/**
	 * A compound statement's kind: a stored program's body (a trigger's
	 * among them), which runs only when called, or MariaDB's BEGIN NOT
	 * ATOMIC block, which runs now.
	 */
	compound: "program" | "block" | undefined;
	/** Its BEGIN/CASE … END nesting. */
	depth: number;
	/** How many parentheses are open: a parameter list holds no body. */
	parens: number;
	/** The word before this one: a routine's name follows its kind. */
	last: string;
	/** Tokens that belong to the one before them: `END CASE`'s CASE. */
	skip: number;
}

/** `END IF` and the like end a control statement; `END FOR UPDATE` ends a CASE. */
const END_OF_CONTROL =
	/^\s+(?:IF|LOOP|WHILE|REPEAT|FOR(?!\s+(?:UPDATE|SHARE)\b))\b/i;

/** Whether this BEGIN opens a body, not names a parameter or a routine. */
const opensBody = (s: Statement, next: string, rules: Rules): boolean =>
	s.parens === 0 &&
	s.last !== s.kind &&
	s.last !== "EXISTS" &&
	(!rules.scan.atomicBodies || /^\s+ATOMIC\b/i.test(next));

/**
 * Reads `sql` statement by statement: `onToken` sees each token of a
 * statement, and `onEnd` the end of each, at a `;` or the end of `sql`,
 * with what was read of it. A `;` inside a compound statement's
 * BEGIN … END doesn't end it.
 */
function readStatements(
	sql: string,
	rules: Rules,
	onToken: (token: string, start: boolean, statement: Statement) => void,
	onEnd: (end: number, statement: Statement) => void,
): void {
	const fresh = (): Statement => ({
		words: [],
		kind: undefined,
		compound: undefined,
		depth: 0,
		parens: 0,
		last: "",
		skip: 0,
	});
	let statement = fresh();
	scanSql(sql, rules, (token, end, start) => {
		const s = statement;
		if (token === ";") {
			if (s.compound !== undefined && s.depth > 0) {
				onToken(token, start, s);
				s.words.length = 0;
				return;
			}
			onEnd(end, s);
			statement = fresh();
			return;
		}
		if (s.skip > 0) {
			s.skip--;
			return;
		}
		const next = sql.slice(end);
		if (token === "(") s.parens++;
		else if (token === ")") s.parens--;
		if (
			rules.scan.notAtomicBlocks &&
			start &&
			s.compound === undefined &&
			token === "BEGIN" &&
			/^\s+NOT\s+ATOMIC\b/i.test(next)
		) {
			s.compound = "block";
			s.depth = 1;
			s.skip = 2;
			return;
		}
		if (s.compound !== undefined) {
			if (token === "CASE" || (token === "BEGIN" && opensBody(s, next, rules)))
				s.depth++;
			else if (token === "END") {
				if (rules.scan.atomicBodies) s.depth--;
				else if (/^\s+CASE\b/i.test(next)) {
					s.depth--;
					s.skip = 1;
				} else if (!END_OF_CONTROL.test(next)) s.depth--;
			}
		} else if (
			s.words[0] === "CREATE" &&
			s.kind === undefined &&
			CREATE_KINDS.has(token)
		) {
			s.kind = token;
			if (rules.scan.programs.has(token)) s.compound = "program";
		}
		onToken(token, start, s);
		if (s.words.length < 4) s.words.push(token);
		s.last = token;
	});
	onEnd(sql.length, statement);
}

/**
 * The statements of a script, split at semicolons outside quotes, comments
 * and compound statements' BEGIN … END bodies.
 */
export function splitStatements(sql: string, rules: Rules): string[] {
	const statements: string[] = [];
	let begin = 0;
	let content = false;
	readStatements(
		sql,
		rules,
		(token) => {
			if (token !== ";") content = true;
		},
		(end) => {
			if (content) statements.push(sql.slice(begin, end));
			begin = end;
			content = false;
		},
	);
	return statements;
}

const controlsTransaction = (): Error =>
	new Error(
		"typesql: migrations cannot control transactions; each migration runs in its own transaction",
	);

/** Throws for a ROLLBACK that ends the transaction, not one TO a savepoint. */
function checkRollback([first, second, third]: readonly string[]): void {
	if (
		first === "ROLLBACK" &&
		second !== "TO" &&
		!((second === "WORK" || second === "TRANSACTION") && third === "TO")
	)
		throw new Error(
			"typesql: migrations cannot roll back their enclosing transaction; use ROLLBACK TO a savepoint",
		);
}

/** Keep transaction ownership with the runner, including multi-statement raw SQL. */
export function assertMigrationSql(sql: string, rules: Rules): void {
	readStatements(
		sql,
		rules,
		(token, start, s) => {
			// A `;` inside a block ends one of its statements.
			if (token === ";") {
				if (s.compound === "block") checkRollback(s.words);
				return;
			}
			if (s.compound === "block") {
				if (start && /^(START|COMMIT|XA)$/.test(token))
					throw controlsTransaction();
			} else if (
				s.compound === undefined &&
				start &&
				(/^(BEGIN|START|COMMIT|END|ABORT)$/.test(token) ||
					(rules.scan.xa && token === "XA"))
			)
				throw controlsTransaction();
			if (
				s.words.length === 1 &&
				s.words[0] === "PREPARE" &&
				token === "TRANSACTION"
			)
				throw new Error("typesql: migrations cannot prepare transactions");
		},
		(_end, s) => checkRollback(s.words),
	);
}
