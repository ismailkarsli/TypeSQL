import { RESERVED_WORDS } from "@typesql/core/reserved";
import { LEXIS, type Lexis } from "./lex.js";
import { KEYWORDS, MY_KEYWORDS, MY_TYPES, TYPES } from "./words.js";

export type Dialect = "postgres" | "sqlite" | "mysql" | "mariadb";

/** What the editor tooling needs to know of a dialect. */
export interface DialectFacts {
	readonly lexis: Lexis;
	/** Whether names match in any case. */
	readonly foldsCase: boolean;
	/** The quote of a name, and the names that need none. */
	readonly quote: string;
	readonly bare: RegExp;
	readonly reserved: ReadonlySet<string>;
	/** Schemas that name DB's top level. */
	readonly defaultSchemas: readonly string[];
	/** Whether a qualifier that names no schema of DB names the current database. */
	readonly qualifierMayBeDatabase: boolean;
	/** The schema that unqualified names fall back to, after DB's top level. */
	readonly catalog: string | null;
	/** Words that read as types and keywords. */
	readonly types: ReadonlySet<string>;
	readonly keywords: ReadonlySet<string>;
	/** Whether the VS Code grammar, which reads PostgreSQL, colors its strings right. */
	readonly grammarColors: boolean;
	/** Words after a table that aren't its alias, beyond the common ones. */
	readonly notAlias: ReadonlySet<string>;
	/** Words between FROM, JOIN or UPDATE and the table, beyond ONLY and LATERAL. */
	readonly beforeTable: ReadonlySet<string>;
	/** Words that join a table, beyond JOIN. */
	readonly joins: ReadonlySet<string>;
	/** The words before an UPDATE that sets the INSERT's columns: MySQL's ON DUPLICATE KEY UPDATE. */
	readonly updateSetsTarget: readonly string[];
}

const NONE: ReadonlySet<string> = new Set();

const postgres: DialectFacts = {
	lexis: LEXIS.postgres,
	foldsCase: false,
	quote: '"',
	bare: /^[a-z_][a-z0-9_$]*$/,
	reserved: new Set(RESERVED_WORDS.postgres),
	defaultSchemas: ["public"],
	qualifierMayBeDatabase: false,
	catalog: "pg_catalog",
	types: new Set(TYPES),
	keywords: new Set(KEYWORDS),
	grammarColors: true,
	notAlias: NONE,
	beforeTable: NONE,
	joins: NONE,
	updateSetsTarget: [],
};

// SQLite: the grammar reads [name] and `name` as PostgreSQL would not, and
// misses ?, @name and $name parameters.
const sqlite: DialectFacts = {
	...postgres,
	lexis: LEXIS.sqlite,
	grammarColors: false,
	foldsCase: true,
	bare: /^[A-Za-z_][A-Za-z0-9_$]*$/,
	reserved: new Set(RESERVED_WORDS.sqlite),
	defaultSchemas: ["main", "temp"],
	catalog: null,
};

// MySQL and MariaDB: there "…" is a string, not a name, and # starts a
// comment, so the grammar's colors are wrong.
const mysql: DialectFacts = {
	lexis: LEXIS.mysql,
	foldsCase: true,
	quote: "`",
	bare: /^[A-Za-z_][A-Za-z0-9_$]*$/,
	reserved: new Set(RESERVED_WORDS.mysql),
	defaultSchemas: [],
	qualifierMayBeDatabase: true,
	catalog: null,
	types: new Set([...TYPES, ...MY_TYPES]),
	keywords: new Set([...KEYWORDS, ...MY_KEYWORDS]),
	grammarColors: false,
	// Index hints, PARTITION, STRAIGHT_JOIN, and UPDATE's modifiers.
	notAlias: new Set([
		"use",
		"force",
		"ignore",
		"partition",
		"straight_join",
		"low_priority",
	]),
	beforeTable: new Set(["ignore", "low_priority"]),
	joins: new Set(["straight_join"]),
	updateSetsTarget: ["duplicate", "key"],
};

export const DIALECTS: Readonly<Record<Dialect, DialectFacts>> = {
	postgres,
	sqlite,
	mysql,
	mariadb: mysql,
};

/** `name` as the dialect writes it: bare when it can be, else quoted. */
export function quoteName(name: string, d: DialectFacts): string {
	const word = d.foldsCase ? name.toLowerCase() : name;
	return d.bare.test(name) && !d.reserved.has(word)
		? name
		: d.quote + name.replaceAll(d.quote, d.quote + d.quote) + d.quote;
}
