import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
	type CommandIo,
	connectPostgres,
	databaseUrl,
	introspectCommand,
	listOption,
} from "@typesql/core/adapter";
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

type Option = IntrospectConfig[keyof IntrospectConfig];

const isString = (option: unknown): option is string =>
	typeof option === "string";
const isStrings = (option: unknown): option is readonly string[] =>
	Array.isArray(option) && option.every(isString);
const isFunction = (option: unknown): option is Option =>
	typeof option === "function";
const isColumnTypes = (option: unknown): option is Option =>
	typeof option === "function" ||
	(typeof option === "object" &&
		option !== null &&
		!Array.isArray(option) &&
		Object.values(option).every(isString));
const isBoolean = (option: unknown): option is boolean =>
	typeof option === "boolean";

const OPTIONS: Readonly<
	Record<keyof IntrospectConfig, (option: unknown) => option is Option>
> = {
	url: isString,
	out: isString,
	schemas: isStrings,
	exclude: isStrings,
	viewNotNull: isFunction,
	typeName: isString,
	importFrom: isString,
	imports: isStrings,
	columnTypes: isColumnTypes,
	column: isFunction,
	comments: isBoolean,
};

const isKey = (key: string): key is keyof IntrospectConfig =>
	Object.hasOwn(OPTIONS, key);

const isOption = (key: string, option: unknown): option is Option =>
	option === undefined || (isKey(key) && OPTIONS[key](option));

const isIntrospectConfig = (config: unknown): config is IntrospectConfig =>
	typeof config === "object" &&
	config !== null &&
	!Array.isArray(config) &&
	Object.entries(config).every(([key, option]) => isOption(key, option));

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
	const unknown = Object.keys(loaded).filter((key) => !isKey(key));
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

const parse = (args: string[]) =>
	parseArgs({
		args,
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

/**
 * `typesql introspect --dialect postgres`. `io` replaces the process's
 * output, working directory and environment.
 */
export const main: (
	argv: readonly string[],
	io?: CommandIo,
) => Promise<number> = introspectCommand(USAGE, parse, async (values, io) => {
	let config: IntrospectConfig = {};
	let configDir = io.cwd;
	if (values.config) {
		const file = resolve(io.cwd, values.config);
		config = await loadConfig(file, values.config);
		configDir = dirname(file);
	}
	const url = databaseUrl(values.url ?? config.url, io);
	const options: IntrospectConfig = {
		...config,
		...(values.schema && { schemas: listOption(values.schema) }),
		...(values.exclude && { exclude: listOption(values.exclude) }),
		...(values["type-name"] !== undefined && {
			typeName: values["type-name"],
		}),
		...(values["import-from"] !== undefined && {
			importFrom: values["import-from"],
		}),
		...(values["no-comments"] && { comments: false }),
	};
	const connection = await connectPostgres(url);
	try {
		return {
			source: generateSource(
				await introspect(connection.client, options),
				options,
			),
			// A config file's `out` is relative to the config file, like
			// migrate's paths.
			out: values.out ?? config.out,
			base: values.out === undefined ? configDir : io.cwd,
		};
	} finally {
		await connection.close();
	}
});
