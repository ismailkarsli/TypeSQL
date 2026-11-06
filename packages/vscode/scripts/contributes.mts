// Writes the language server's word lists, token patterns and call names into
// the grammar, and the language and token tables of src/contributes.mts into
// package.json, so none of them can drift. With --check, as the build runs
// it, it only fails on a difference.
import { readFileSync, writeFileSync } from "node:fs";
import { GRAMMAR } from "@typesql/language-server";
import { LANGUAGES, SQL_TOKENS } from "../src/contributes.mts";

type Json = string | number | boolean | null | Json[] | JsonObject;
type JsonObject = { [key: string]: Json };

/** A generated value, and the object and key it goes to. */
interface Field {
	readonly path: string;
	readonly owner: JsonObject | undefined;
	readonly key: string;
	readonly value: Json;
}

interface Change {
	readonly before: Json | undefined;
	readonly after: Json;
}

const check = process.argv.includes("--check");
const stale: string[] = [];

function update(
	name: string,
	fields: (json: JsonObject) => readonly Field[],
	serialize: (text: string, json: JsonObject, changes: Change[]) => string,
): void {
	const file = new URL(`../${name}`, import.meta.url);
	const text = readFileSync(file, "utf8");
	const json: JsonObject = JSON.parse(text);
	const changes: Change[] = [];
	for (const { path, owner, key, value } of fields(json)) {
		if (!owner) throw new Error(`${name} has no ${path}`);
		if (JSON.stringify(owner[key]) === JSON.stringify(value)) continue;
		stale.push(`${name}: ${path}`);
		changes.push({ before: owner[key], after: value });
		owner[key] = value;
	}
	if (changes.length && !check)
		writeFileSync(file, serialize(text, json, changes));
}

const object = (v: Json | undefined): JsonObject | undefined =>
	typeof v === "object" && v !== null && !Array.isArray(v) ? v : undefined;

const words = (list: readonly string[]): string =>
	`(?i)(?<![\\w$])(?:${list.join("|")})(?![\\w$])`;
// A receiver such as `db.` or `this.db.`, or the `.` after a `)`.
const receiver =
	"(?:(?<![\\w$.#])((?:#?[A-Za-z_$][\\w$]*\\s*\\??\\.\\s*)+)|(\\??\\.)\\s*";
const typeArgs = "(?:\\s*(<[^()]*>))?(?=\\s*\\(\\s*(?:[`\"'/]|$))";
const name = `(${GRAMMAR.name}(?![\\w$]))`;
const statement = `(?:--|/\\*|\\(|(?i:${GRAMMAR.statementWords.join("|")})(?=[\\s;(]|$))`;

update(
	"syntaxes/sql-injection.tmLanguage.json",
	(g) => {
		const rule = (key: string) => object(object(g.repository)?.[key]);
		const patterns = rule("tokens")?.patterns;
		const tokenWhere = (test: (p: JsonObject) => boolean) =>
			Array.isArray(patterns)
				? patterns.map(object).find((p) => p !== undefined && test(p))
				: undefined;
		const token = (scope: string) => tokenWhere((p) => p.name === scope);
		const lists = [
			["storage.type.sql", GRAMMAR.types],
			["keyword.other.sql", GRAMMAR.keywords],
			["constant.language.sql", GRAMMAR.constants],
		] as const;
		const lexis = GRAMMAR.lexis;
		const matches = [
			["variable.parameter.positional.sql", lexis.parameter],
			["variable.parameter.named.sql", lexis.named],
			["constant.numeric.sql", lexis.number],
			["entity.name.function.sql", `${lexis.name}(?=\\()`],
			["keyword.operator.sql", lexis.operator],
		] as const;
		// A single-quoted literal writes the SQL quote as \'.
		const quotes = { double: "'", single: "\\\\'", template: "'" };
		return [
			{
				path: "injectionSelector",
				owner: g,
				key: "injectionSelector",
				value: Object.values(LANGUAGES)
					.map((scope) => `L:${scope} -comment -string`)
					.join(", "),
			},
			{
				path: "repository.call.begin",
				owner: rule("call"),
				key: "begin",
				value: `${receiver}|(?<![\\w$]))(?:${name}\\s*(\\??\\.)\\s*(${GRAMMAR.nameMethods.join("|")})|${name})${typeArgs}`,
			},
			{
				path: "repository.migration-call.begin",
				owner: rule("migration-call"),
				key: "begin",
				value: `${receiver})(${GRAMMAR.statementMethods.join("|")})(?![\\w$])${typeArgs}`,
			},
			{
				path: "repository.statement-argument.end",
				owner: rule("statement-argument"),
				key: "end",
				value: `(?<=[\`"'])|(?=[^\\s\`"'])|(?=["'](?!\\s*${statement}))|(?=\`(?!\\s*${statement}|\\s*$))`,
			},
			...lists.map(
				([scope, list]): Field => ({
					path: `repository.tokens ${scope}`,
					owner: token(scope),
					key: "match",
					value: words(list),
				}),
			),
			...matches.map(
				([scope, value]): Field => ({
					path: `repository.tokens ${scope}`,
					owner: token(scope),
					key: "match",
					value,
				}),
			),
			{
				path: "repository.tokens cast",
				owner: tokenWhere(
					(p) =>
						object(object(p.captures)?.["1"])?.name ===
						"keyword.operator.cast.sql",
				),
				key: "match",
				value: lexis.cast,
			},
			{
				path: "repository.tokens name",
				owner: tokenWhere((p) => Object.keys(p).join() === "match"),
				key: "match",
				value: lexis.name,
			},
			...Object.entries(quotes).flatMap(([kind, quote]): Field[] => [
				{
					path: `repository.string-${kind}.begin`,
					owner: rule(`string-${kind}`),
					key: "begin",
					value: `${lexis.stringPrefix}${quote}`,
				},
				{
					path: `repository.dollar-string-${kind}.begin`,
					owner: rule(`dollar-string-${kind}`),
					key: "begin",
					value: lexis.dollarTag,
				},
			]),
		];
	},
	// Replace each generated value in place, to keep the file's layout: a
	// value found more than once is set alike in each place.
	(text, _, changes) => {
		const after = new Map<string, Json>();
		const count = new Map<string, number>();
		for (const change of changes) {
			const from = JSON.stringify(change.before);
			if (typeof change.before !== "string")
				throw new Error(`${from} in the grammar is not a string`);
			if (after.has(from) && after.get(from) !== change.after)
				throw new Error(`${from} in the grammar has two new values`);
			after.set(from, change.after);
			count.set(from, (count.get(from) ?? 0) + 1);
		}
		let out = text;
		for (const [from, value] of after) {
			if (out.split(from).length - 1 !== count.get(from))
				throw new Error(
					`${from} is in the grammar more often than it is generated`,
				);
			out = out.replaceAll(from, () => JSON.stringify(value));
		}
		return out;
	},
);

const scopes: JsonObject = Object.fromEntries(
	Object.values(SQL_TOKENS).flatMap((t) => (t ? [[t.token, [t.scope]]] : [])),
);
update(
	"package.json",
	(pkg) => {
		const contributes = object(pkg.contributes);
		const grammars = contributes?.grammars;
		return [
			{
				path: "activationEvents",
				owner: pkg,
				key: "activationEvents",
				value: Object.keys(LANGUAGES).map((id) => `onLanguage:${id}`),
			},
			{
				path: "contributes.grammars[0].injectTo",
				owner: Array.isArray(grammars) ? object(grammars[0]) : undefined,
				key: "injectTo",
				value: Object.values(LANGUAGES),
			},
			{
				path: "contributes.semanticTokenScopes",
				owner: contributes,
				key: "semanticTokenScopes",
				value: Object.keys(LANGUAGES).map((language) => ({
					language,
					scopes,
				})),
			},
		];
	},
	(_, pkg) => `${JSON.stringify(pkg, null, "\t")}\n`,
);

if (stale.length) {
	const list = stale.map((s) => `\n  ${s}`).join("");
	if (check) {
		console.error(
			`Out of date with @typesql/language-server or src/contributes.mts:${list}\nRun: pnpm --filter typesql contributes`,
		);
		process.exit(1);
	}
	console.log(`Updated:${list}`);
}
