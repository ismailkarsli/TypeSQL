import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { SqliteDatabase } from "../client.js";
import { type GenerateOptions, generateSource } from "./emit.js";
import { introspect } from "./introspect.js";

const USAGE = `Usage: typesql introspect --dialect sqlite --db <file> [options]

Reads a SQLite database file and writes its TypeSQL schema (tables and views).

Options:
  --db <file>          the database file to read (opened read-only)
  --out <file>         write the schema to <file> instead of stdout
  --exclude <pattern>  relation to leave out (* wildcard); repeat or comma-separate
  --type-name <name>   name of the schema interface (default: DB)
  --import-from <mod>  module the column helpers come from (default: @typesql/core/sqlite)
  -h, --help           show this help
`;

interface Io {
	readonly stdout: (s: string) => void;
	readonly stderr: (s: string) => void;
	readonly cwd: string;
	readonly open?: (file: string) => Promise<SqliteDatabase & { close(): void }>;
}

const defaultIo = (): Io => ({
	stdout: (s) => process.stdout.write(s),
	stderr: (s) => process.stderr.write(s),
	cwd: process.cwd(),
});

async function openReadOnly(
	file: string,
): Promise<SqliteDatabase & { close(): void }> {
	const { DatabaseSync } = await import("node:sqlite");
	return new DatabaseSync(file, {
		readOnly: true,
	}) as unknown as SqliteDatabase & {
		close(): void;
	};
}

const parse = (argv: readonly string[]) =>
	parseArgs({
		args: [...argv],
		allowPositionals: true,
		options: {
			db: { type: "string" },
			out: { type: "string" },
			exclude: { type: "string", multiple: true },
			"type-name": { type: "string" },
			"import-from": { type: "string" },
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
	if (!values.db) {
		io.stderr(`typesql introspect: pass --db <file>\n`);
		return 2;
	}
	try {
		const db = await (io.open ?? openReadOnly)(resolve(io.cwd, values.db));
		let source: string;
		try {
			const options: GenerateOptions = {
				...(values["type-name"] ? { typeName: values["type-name"] } : {}),
				...(values["import-from"] ? { importFrom: values["import-from"] } : {}),
			};
			source = generateSource(
				introspect(db, {
					exclude: (values.exclude ?? []).flatMap((e) => e.split(",")),
				}),
				options,
			);
		} finally {
			db.close();
		}
		if (values.out) {
			const out = resolve(io.cwd, values.out);
			await mkdir(dirname(out), { recursive: true });
			await writeFile(out, source);
			io.stderr(`typesql introspect: wrote ${values.out}\n`);
		} else io.stdout(source);
		return 0;
	} catch (err) {
		io.stderr(`typesql introspect: ${(err as Error).message}\n`);
		return 1;
	}
}
