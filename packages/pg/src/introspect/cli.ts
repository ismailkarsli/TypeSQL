import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { type CommandIo, introspectArgs } from "@typesql/core/adapter";
import type { PgQueryable } from "../client.js";
import { type GenerateOptions, generateSource } from "./emit.js";
import { type IntrospectOptions, introspect } from "./introspect.js";

export interface IntrospectConfig extends GenerateOptions, IntrospectOptions {
	readonly url?: string;
	readonly out?: string;
}

const USAGE = `Usage: typesql introspect [--dialect postgres] [options]

Reads a live Postgres database and writes its TypeSQL schema (tables, views, enums).

Options:
  --url <url>          connection string (default: $DATABASE_URL)
  --out <file>         write the schema to <file> instead of stdout
  --schema <name>      schema to read; repeat or comma-separate (default: all but system schemas)
  --exclude <pattern>  relation to leave out (name or schema.name, * wildcard); repeat or comma-separate
  --type-name <name>   name of the schema interface (default: DB)
  --import-from <mod>  module the column helpers come from (default: @typesql/core/postgres)
  --config <file>      module whose default export holds these options and more
                       (columnTypes for JSON columns, imports, column(...) hook)
  --no-comments        omit JSDoc from comments, domains and generated columns
  -h, --help           show this help
`;

interface Io extends CommandIo {
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly cwd: string;
	readonly connect?: (
		url: string,
	) => Promise<PgQueryable & { end(): Promise<void> }>;
}

const defaultIo = (): Io => ({
	stdout: (s) => process.stdout.write(s),
	stderr: (s) => process.stderr.write(s),
	env: process.env,
	cwd: process.cwd(),
});

// pg rejects a refused `localhost` connection (IPv4 and IPv6) with an
// AggregateError whose own message is empty.
const message = (cause: unknown): string => {
	if (!(cause instanceof Error)) return String(cause);
	if (cause.message) return cause.message;
	if (cause instanceof AggregateError && cause.errors.length > 0)
		return Array.from(new Set(cause.errors.map(message))).join("; ");
	const code = "code" in cause ? cause.code : undefined;
	return code === undefined || code === null ? cause.name : String(code);
};

const CONFIG_KEYS = new Set([
	"url",
	"out",
	"schemas",
	"exclude",
	"viewNotNull",
	"typeName",
	"importFrom",
	"imports",
	"columnTypes",
	"column",
	"comments",
]);

async function pgConnect(
	url: string,
): Promise<PgQueryable & { end(): Promise<void> }> {
	if (!URL.canParse(url) && !url.startsWith("/"))
		throw new Error(
			`invalid connection URL ${JSON.stringify(url)} (expected postgres://user:password@host:port/database)`,
		);
	let Client: typeof import("pg").Client;
	try {
		({ Client } = (await import("pg")).default);
	} catch {
		throw new Error('the "pg" package is not installed: npm install pg');
	}
	const client = new Client({ connectionString: url });
	await client.connect();
	return client;
}

const isStrings = (option: unknown): option is readonly string[] =>
	Array.isArray(option) && option.every((s) => typeof s === "string");

/** Whether `option` is a valid value of the configuration key `key`. */
function isOption(
	key: string,
	option: unknown,
): option is IntrospectConfig[keyof IntrospectConfig] {
	if (option === undefined) return true;
	switch (key) {
		case "url":
		case "out":
		case "typeName":
		case "importFrom":
			return typeof option === "string";
		case "schemas":
		case "exclude":
		case "imports":
			return isStrings(option);
		case "viewNotNull":
		case "column":
			return typeof option === "function";
		case "columnTypes":
			return (
				typeof option === "function" ||
				(typeof option === "object" &&
					option !== null &&
					!Array.isArray(option) &&
					Object.values(option).every((type) => typeof type === "string"))
			);
		case "comments":
			return typeof option === "boolean";
		default:
			return false;
	}
}

const isIntrospectConfig = (config: unknown): config is IntrospectConfig =>
	typeof config === "object" &&
	config !== null &&
	!Array.isArray(config) &&
	Object.entries(config).every(([key, option]) => isOption(key, option));

/** Imports the configuration module `file`, given on the command line as `name`. */
async function loadConfig(
	file: string,
	name: string,
): Promise<IntrospectConfig> {
	const mod: unknown = await import(pathToFileURL(file).href);
	const loaded =
		typeof mod === "object" && mod !== null && "default" in mod
			? mod.default
			: undefined;
	if (loaded === null || typeof loaded !== "object" || Array.isArray(loaded))
		throw new Error(`${name} must default-export a configuration object`);
	const unknown = Object.keys(loaded).filter((key) => !CONFIG_KEYS.has(key));
	if (unknown.length > 0)
		throw new Error(
			`${name}: unknown option${unknown.length > 1 ? "s" : ""} ${unknown.join(", ")}`,
		);
	if (isIntrospectConfig(loaded)) return loaded;
	const invalid = Object.entries(loaded)
		.filter(([key, option]) => !isOption(key, option))
		.map(([key]) => key);
	throw new Error(
		`${name}: invalid value for option${invalid.length > 1 ? "s" : ""} ${invalid.join(", ")}`,
	);
}

const parse = (argv: readonly string[]) =>
	parseArgs({
		args: [...argv],
		allowPositionals: true,
		options: {
			url: { type: "string" },
			out: { type: "string" },
			schema: { type: "string", multiple: true },
			exclude: { type: "string", multiple: true },
			"type-name": { type: "string" },
			"import-from": { type: "string" },
			config: { type: "string" },
			"no-comments": { type: "boolean" },
			help: { type: "boolean", short: "h" },
		},
	});

export async function main(
	argv: readonly string[],
	io: Io = defaultIo(),
): Promise<number> {
	const values = introspectArgs(io, USAGE, () => parse(argv));
	if (typeof values === "number") return values;

	try {
		let config: IntrospectConfig = {};
		let configDir = io.cwd;
		if (values.config) {
			const file = resolve(io.cwd, values.config);
			config = await loadConfig(file, values.config);
			configDir = dirname(file);
		}
		const url = values.url ?? config.url ?? io.env.DATABASE_URL;
		if (!url) {
			io.stderr("typesql introspect: pass --url or set DATABASE_URL\n");
			return 2;
		}
		const list = (v: string[]) =>
			v.flatMap((s) =>
				s
					.split(",")
					.map((x) => x.trim())
					.filter(Boolean),
			);
		const options: IntrospectConfig = {
			...config,
			...(values.schema && { schemas: list(values.schema) }),
			...(values.exclude && { exclude: list(values.exclude) }),
			...(values["type-name"] !== undefined && {
				typeName: values["type-name"],
			}),
			...(values["import-from"] !== undefined && {
				importFrom: values["import-from"],
			}),
			...(values["no-comments"] && { comments: false }),
		};
		const client = await (io.connect ?? pgConnect)(url);
		let source: string;
		try {
			source = generateSource(await introspect(client, options), options);
		} finally {
			await client.end();
		}
		// A config file's `out` is relative to the config file, like migrate's paths.
		const out = values.out ?? config.out;
		if (out === undefined) {
			io.stdout(source);
		} else {
			const file = resolve(values.out === undefined ? configDir : io.cwd, out);
			await mkdir(dirname(file), { recursive: true });
			await writeFile(file, source);
			io.stderr(`typesql introspect: wrote ${out}\n`);
		}
		return 0;
	} catch (err) {
		io.stderr(`typesql introspect: ${message(err)}\n`);
		return 1;
	}
}
