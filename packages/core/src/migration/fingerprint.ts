import type { Executor } from "../query.js";
import { createMigrationContext } from "./context.js";

type Dialect = "postgres" | "sqlite";

/** How long a dry run may take before it is an error. */
const DRY_RUN_LIMIT = 5000;

/** Fingerprints start with their format, so 3.x source hashes are told apart. */
const FORMAT = "v4:";

export const isFingerprint = (hash: string): boolean => hash.startsWith(FORMAT);

/**
 * Normalize a DDL statement outside its quoted parts: comments are removed,
 * whitespace runs become one space, spaces next to `(`, `)`, `,` and `;` are
 * removed, and the text is lowercased. String literals, quoted identifiers
 * and dollar-quoted bodies stay exact.
 */
function normalizeDdl(sql: string, dialect: Dialect): string {
	let out = "";
	let space = false;
	const word = (text: string): void => {
		if (space && out !== "" && !/[(),;]$/.test(out) && !/^[(),;]/.test(text))
			out += " ";
		space = false;
		out += text;
	};
	for (let i = 0; i < sql.length; ) {
		const char = sql.charAt(i);
		if (/\s/.test(char)) {
			space = true;
			i++;
			continue;
		}
		if (sql.startsWith("--", i)) {
			const end = /[\r\n]/.exec(sql.slice(i + 2));
			i = end === null ? sql.length : i + 2 + end.index + 1;
			space = true;
			continue;
		}
		if (sql.startsWith("/*", i)) {
			let depth = 1;
			i += 2;
			while (i < sql.length && depth > 0) {
				if (sql.startsWith("/*", i) && dialect === "postgres") {
					depth++;
					i += 2;
				} else if (sql.startsWith("*/", i)) {
					depth--;
					i += 2;
				} else i++;
			}
			space = true;
			continue;
		}
		if (
			char === "'" ||
			char === '"' ||
			(dialect === "sqlite" && (char === "`" || char === "["))
		) {
			const end = char === "[" ? "]" : char;
			// E'…' strings take backslash escapes.
			const escapes =
				dialect === "postgres" &&
				char === "'" &&
				/[eE]/.test(sql[i - 1] ?? "") &&
				!/[\w$]/.test(sql[i - 2] ?? "");
			const start = i;
			i++;
			while (i < sql.length) {
				if (escapes && sql[i] === "\\") i += 2;
				else if (sql[i] === end) {
					if (sql[i + 1] === end && char !== "[") i += 2;
					else {
						i++;
						break;
					}
				} else i++;
			}
			word(sql.slice(start, i));
			continue;
		}
		if (char === "$" && dialect === "postgres") {
			const tag = /^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/.exec(sql.slice(i))?.[0];
			if (tag) {
				const end = sql.indexOf(tag, i + tag.length);
				const stop = end < 0 ? sql.length : end + tag.length;
				word(sql.slice(i, stop));
				i = stop;
				continue;
			}
		}
		const name = /^[a-zA-Z_][a-zA-Z_0-9$]*/.exec(sql.slice(i))?.[0];
		if (name) {
			word(name.toLowerCase());
			i += name.length;
			continue;
		}
		word(char.toLowerCase());
		i++;
	}
	return out;
}

const hex = (buffer: ArrayBuffer): string =>
	Array.from(new Uint8Array(buffer), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");

/** SHA-256 of `text` as hex, with Web Crypto (Node, Bun, Deno and Workers). */
export async function sha256(text: string): Promise<ArrayBuffer> {
	return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

/**
 * Run `up` against a recording `db` with no database and hash the steps it
 * takes: each `.add()` with its normalized text, each `.raw()` without its
 * text (its SQL may be built at runtime). Queries return no rows; a dry run
 * that throws ends there.
 */
export async function fingerprint(
	dialect: Dialect,
	up: (db: never) => unknown,
	label: string,
): Promise<string> {
	const steps: (readonly [string] | readonly [string, string])[] = [];
	let done = false;
	const check = (): void => {
		if (done)
			throw new Error(
				`typesql: the dry run of migration ${label} has ended; its db can't be used any more`,
			);
	};
	const execute: Executor = Object.assign(
		async () => {
			check();
			return [];
		},
		{
			count: async () => {
				check();
				return 0;
			},
		},
	);
	const db = createMigrationContext(dialect, execute, async (kind, sql) => {
		check();
		steps.push(kind === "add" ? [kind, normalizeDdl(sql, dialect)] : [kind]);
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	const limit = new Promise<"timeout">((resolve) => {
		timer = setTimeout(() => resolve("timeout"), DRY_RUN_LIMIT);
	});
	try {
		const run = Promise.resolve()
			.then(() => up(db as never))
			.then(
				() => "done" as const,
				() => "done" as const,
			);
		if ((await Promise.race([run, limit])) === "timeout")
			throw new Error(
				`typesql: the dry run of migration ${label} ran longer than ${DRY_RUN_LIMIT / 1000} seconds; a migration fingerprints by running up without a database, where every query returns no rows, so a loop that waits for rows never ends`,
			);
	} finally {
		done = true;
		clearTimeout(timer);
	}
	return FORMAT + hex(await sha256(JSON.stringify(steps)));
}
