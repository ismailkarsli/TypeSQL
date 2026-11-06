import { parseArgs } from "node:util";
import {
	type CommandIo,
	connectMysql,
	databaseUrl,
	introspectCommand,
	listOption,
} from "@typesql/core/adapter";
import { type GenerateOptions, generateSource } from "./emit.js";
import { type IntrospectOptions, introspect } from "./introspect.js";

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

const parse = (args: string[]) =>
	parseArgs({
		args,
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

/**
 * `typesql introspect --dialect mysql` (or `mariadb`), with mysql2, or the
 * mariadb connector when mysql2 is not installed. `io` replaces the
 * process's output, working directory and environment.
 */
export const main: (
	argv: readonly string[],
	io?: CommandIo,
) => Promise<number> = introspectCommand(USAGE, parse, async (values, io) => {
	const url = databaseUrl(values.url, io);
	const options: IntrospectOptions & GenerateOptions = {
		...(values.database !== undefined && { database: values.database }),
		exclude: listOption(values.exclude),
		...(values["type-name"] !== undefined && {
			typeName: values["type-name"],
		}),
		...(values["import-from"] !== undefined && {
			importFrom: values["import-from"],
		}),
		...(values["no-comments"] && { comments: false }),
	};
	const connection = await connectMysql(url);
	try {
		return {
			source: generateSource(
				await introspect(connection.client, options),
				options,
			),
			out: values.out,
		};
	} finally {
		await connection.close();
	}
});
