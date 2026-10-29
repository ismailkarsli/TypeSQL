import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { PgQueryable } from "../client.js";
import { type GenerateOptions, generateSource } from "./emit.js";
import { type IntrospectOptions, introspect } from "./introspect.js";

export interface IntrospectConfig extends GenerateOptions, IntrospectOptions {
	readonly url?: string;
	readonly out?: string;
}

const USAGE = `Usage: typesql introspect [options]

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

interface Io {
	readonly stdout: (s: string) => void;
	readonly stderr: (s: string) => void;
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

async function pgConnect(
	url: string,
): Promise<PgQueryable & { end(): Promise<void> }> {
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
	let parsed: ReturnType<typeof parse>;
	try {
		parsed = parse(argv);
	} catch (err) {
		io.stderr(`${(err as Error).message}\n\n${USAGE}`);
		return 2;
	}
	const { values, positionals } = parsed;
	if (values.help || positionals.length === 0) {
		(values.help ? io.stdout : io.stderr)(USAGE);
		return values.help ? 0 : 2;
	}
	if (positionals[0] !== "introspect" || positionals.length > 1) {
		io.stderr(`unknown command: ${positionals.join(" ")}\n\n${USAGE}`);
		return 2;
	}

	try {
		let config: IntrospectConfig = {};
		if (values.config) {
			const mod = (await import(
				pathToFileURL(resolve(io.cwd, values.config)).href
			)) as { default?: IntrospectConfig };
			config = mod.default ?? {};
		}
		const url = values.url ?? config.url ?? io.env["DATABASE_URL"];
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
		const out = values.out ?? config.out;
		if (out === undefined) {
			io.stdout(source);
		} else {
			const file = resolve(io.cwd, out);
			await mkdir(dirname(file), { recursive: true });
			await writeFile(file, source);
			io.stderr(`typesql introspect: wrote ${out}\n`);
		}
		return 0;
	} catch (err) {
		io.stderr(`typesql introspect: ${(err as Error).message}\n`);
		return 1;
	}
}
