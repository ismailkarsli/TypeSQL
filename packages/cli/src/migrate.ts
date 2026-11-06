import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { type CommandIo, commandIo, errorMessage } from "@typesql/core/adapter";
import {
	type DownResult,
	loadMigrator,
	type MigrationError,
	missingCore,
	type UpResult,
} from "@typesql/core/migration";

const COMMANDS = ["latest", "up", "down", "status", "make", "generate"];

const USAGE = `Usage: typesql migrate <latest|up|down|status|make name|generate> [options]

  latest              apply every pending migration
  up                  apply the next pending migration
  down                revert the last applied migration
  status              list applied and pending migrations
  make <name>         create a migration file that starts from the last one
  generate            write the schema of the last migration to a DB file

Options:
  --config <file>     config module (default: ./typesql.config.ts)
  --dialect <name>    postgres, sqlite, mysql or mariadb; overrides config
  --url <url>         PostgreSQL, MySQL or MariaDB URL; overrides config
                      (default: $DATABASE_URL)
  --db <file>         SQLite database file; overrides config
  --dir <directory>   migrations directory; overrides config
  --out <file>        schema file to write (default: config.schemaFile or db.ts)
  --no-generate       don't write the schema file after up, down or latest
  -h, --help          show this help

The config file default-exports a migrator:

  import { createMigrator } from "@typesql/core/migration";
  export default createMigrator({ dialect: "postgres", url: process.env.DATABASE_URL, migrationsDir: "./migrations" });

Without a config file, pass --dialect and --url or --db; the directory
defaults to ./migrations. Paths in the config are relative to it, and paths
in flags to the working directory. Requires Node.js 26 or newer.
`;

const parse = (argv: readonly string[]) =>
	parseArgs({
		args: [...argv],
		allowPositionals: true,
		allowNegative: true,
		options: {
			config: { type: "string" },
			dialect: { type: "string" },
			url: { type: "string" },
			db: { type: "string" },
			dir: { type: "string" },
			out: { type: "string" },
			generate: { type: "boolean" },
			help: { type: "boolean", short: "h" },
		},
	});

/** Whether `error` is a MigrationError from any copy of `@typesql/core`. */
function isMigrationError(error: unknown): error is MigrationError {
	return error instanceof Error && error.name === "MigrationError";
}

/** 0: done, 1: the command failed, 2: a usage error. */
type ExitCode = 0 | 1 | 2;

export async function main(
	argv: readonly string[],
	given?: CommandIo,
): Promise<ExitCode> {
	const io = commandIo(given);
	let parsed: ReturnType<typeof parse>;
	try {
		parsed = parse(argv);
	} catch (error) {
		io.stderr(`typesql migrate: ${errorMessage(error)}\n\n${USAGE}`);
		return 2;
	}
	const { values, positionals } = parsed;
	if (values.help) {
		io.stdout(USAGE);
		return 0;
	}
	const command = positionals[0];
	if (
		!command ||
		!COMMANDS.includes(command) ||
		positionals.length !== (command === "make" ? 2 : 1)
	) {
		io.stderr(
			`typesql migrate: expected latest, up, down, status, make <name>, or generate\n\n${USAGE}`,
		);
		return 2;
	}
	const print = (text: string) => io.stdout(`typesql migrate: ${text}\n`);
	try {
		const migrator = await loadMigrator({
			cwd: io.cwd,
			env: io.env,
			config: values.config,
			overrides: {
				dialect: values.dialect,
				url: values.url,
				db: values.db,
				migrationsDir: values.dir,
				schemaFile: values.out,
				generate: values.generate,
			},
		});

		switch (command) {
			case "make": {
				const created = await migrator.make(positionals[1] ?? "");
				print(`created ${created}`);
				const missing = await missingCore(dirname(created));
				if (missing !== undefined)
					io.stderr(`typesql migrate: warning: ${missing}\n`);
				return 0;
			}
			case "generate":
				print(`generated ${await migrator.generate()}`);
				return 0;
			case "status": {
				const status = await migrator.status();
				if (status.length === 0) print("no migrations");
				for (const entry of status)
					io.stdout(
						`${entry.applied ? "applied" : "pending"}  ${entry.appliedAt?.toISOString() ?? "                        "}  ${entry.name}\n`,
					);
				return 0;
			}
		}
		const report = (
			names: readonly string[],
			write: { schemaFile?: string; schemaError?: Error },
		) => {
			for (const name of names)
				print(`${command === "down" ? "reverted" : "applied"} ${name}`);
			if (write.schemaFile !== undefined)
				print(`generated ${write.schemaFile}`);
			// The database is migrated by now: a schema file that can't be
			// written is a warning, and the exit code reports the migration.
			if (write.schemaError !== undefined)
				io.stderr(
					`typesql migrate: warning: the schema file was not updated: ${errorMessage(write.schemaError)}\n` +
						"typesql migrate: fix the cause, then run `typesql migrate generate`\n",
				);
		};
		let result: UpResult | DownResult;
		try {
			result =
				command === "down"
					? await migrator.down()
					: command === "up"
						? await migrator.up()
						: await migrator.latest();
		} catch (error) {
			// The migrations before the one that failed stay applied.
			if (isMigrationError(error)) report(error.applied, error);
			throw error;
		}
		const names = "reverted" in result ? result.reverted : result.applied;
		if (names.length === 0)
			print(`no ${command === "down" ? "applied" : "pending"} migrations`);
		report(names, result);
		return 0;
	} catch (error) {
		io.stderr(`typesql migrate: ${errorMessage(error)}\n`);
		return 1;
	}
}
