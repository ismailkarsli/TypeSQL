import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
	type CommandIo,
	connectSqlite,
	introspectCommand,
	listOption,
	UsageError,
} from "@typesql/core/adapter";
import { generateSource } from "./emit.js";
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

const parse = (args: string[]) =>
	parseArgs({
		args,
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

/**
 * `typesql introspect --dialect sqlite`. `io` replaces the process's
 * output and working directory.
 */
export const main: (
	argv: readonly string[],
	io?: CommandIo,
) => Promise<number> = introspectCommand(USAGE, parse, async (values, io) => {
	if (!values.db) throw new UsageError("pass --db <file>");
	const connection = await connectSqlite(resolve(io.cwd, values.db), {
		readOnly: true,
	});
	try {
		return {
			source: generateSource(
				introspect(connection.client, {
					exclude: listOption(values.exclude),
				}),
				{
					...(values["type-name"] && { typeName: values["type-name"] }),
					...(values["import-from"] && { importFrom: values["import-from"] }),
				},
			),
			out: values.out || undefined,
		};
	} finally {
		await connection.close();
	}
});
