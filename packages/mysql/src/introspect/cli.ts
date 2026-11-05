import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type CommandIo, introspectArgs } from "@typesql/core/adapter";
import { type GenerateOptions, generateSource } from "./emit.js";
import {
	type IntrospectOptions,
	introspect,
	type MySqlQueryable,
} from "./introspect.js";

const USAGE = `Usage: typesql introspect --dialect mysql|mariadb [options]

Reads a live MySQL or MariaDB database and writes its TypeSQL schema (tables and views).

Options:
  --url <url>          connection string (default: $DATABASE_URL),
                       mysql://user:password@host:port/database
  --database <name>    database to read (default: the one in the URL)
  --out <file>         write the schema to <file> instead of stdout
  --exclude <pattern>  relation to leave out (* wildcard); repeat or comma-separate
  --type-name <name>   name of the schema interface (default: DB)
  --import-from <mod>  module the column helpers come from (default: @typesql/core/mysql)
  --no-comments        omit JSDoc from comments, generated and invisible columns
  -h, --help           show this help
`;

type Connection = MySqlQueryable & { end(): Promise<void> };

interface Io extends CommandIo {
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly cwd: string;
	readonly connect?: (url: string) => Promise<Connection>;
}

const defaultIo = (): Io => ({
	stdout: (s) => process.stdout.write(s),
	stderr: (s) => process.stderr.write(s),
	env: process.env,
	cwd: process.cwd(),
});

// A refused `localhost` connection (IPv4 and IPv6) rejects with an
// AggregateError whose own message is empty.
const message = (cause: unknown): string => {
	if (!(cause instanceof Error)) return String(cause);
	if (cause.message) return cause.message;
	if (cause instanceof AggregateError && cause.errors.length > 0)
		return Array.from(new Set(cause.errors.map(message))).join("; ");
	const code = "code" in cause ? cause.code : undefined;
	return code === undefined || code === null ? cause.name : String(code);
};

/** mysql2 if it is installed, else the mariadb connector. */
async function connect(url: string): Promise<Connection> {
	if (!URL.canParse(url) || !/^(mysql|mariadb):$/.test(new URL(url).protocol))
		throw new Error(
			`invalid connection URL ${JSON.stringify(url)} (expected mysql://user:password@host:port/database)`,
		);
	const rest = url.slice(url.indexOf(":"));
	let mysql2: typeof import("mysql2/promise") | undefined;
	try {
		mysql2 = (await import("mysql2/promise")).default;
	} catch {}
	if (mysql2) return mysql2.createConnection(`mysql${rest}`);
	let mariadb: typeof import("mariadb");
	try {
		mariadb = await import("mariadb");
	} catch {
		throw new Error(
			'neither "mysql2" nor "mariadb" is installed: npm install mysql2',
		);
	}
	return mariadb.createConnection(`mariadb${rest}`);
}

const parse = (argv: readonly string[]) =>
	parseArgs({
		args: [...argv],
		allowPositionals: true,
		options: {
			url: { type: "string" },
			database: { type: "string" },
			out: { type: "string" },
			exclude: { type: "string", multiple: true },
			"type-name": { type: "string" },
			"import-from": { type: "string" },
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
	const url = values.url ?? io.env.DATABASE_URL;
	if (!url) {
		io.stderr("typesql introspect: pass --url or set DATABASE_URL\n");
		return 2;
	}
	try {
		const options: IntrospectOptions & GenerateOptions = {
			...(values.database !== undefined && { database: values.database }),
			exclude: (values.exclude ?? []).flatMap((e) =>
				e
					.split(",")
					.map((x) => x.trim())
					.filter(Boolean),
			),
			...(values["type-name"] !== undefined && {
				typeName: values["type-name"],
			}),
			...(values["import-from"] !== undefined && {
				importFrom: values["import-from"],
			}),
			...(values["no-comments"] && { comments: false }),
		};
		const client = await (io.connect ?? connect)(url);
		let source: string;
		try {
			source = generateSource(await introspect(client, options), options);
		} finally {
			await client.end();
		}
		if (values.out) {
			const out = resolve(io.cwd, values.out);
			await mkdir(dirname(out), { recursive: true });
			await writeFile(out, source);
			io.stderr(`typesql introspect: wrote ${values.out}\n`);
		} else io.stdout(source);
		return 0;
	} catch (err) {
		io.stderr(`typesql introspect: ${message(err)}\n`);
		return 1;
	}
}
