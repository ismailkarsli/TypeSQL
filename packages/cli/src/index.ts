import { main as postgres } from "@typesql/pg/introspect";
import { main as sqlite } from "@typesql/sqlite/introspect";

export type { MigrationConfig } from "./migrate.js";

export type Dialect = "postgres" | "sqlite";

const DIALECTS: Readonly<
	Record<Dialect, (argv: readonly string[]) => Promise<number>>
> = { postgres, sqlite };

const USAGE = `Usage: typesql migrate <up|down|latest|make name> [options]
       typesql introspect [--dialect postgres|sqlite] [options]

Manage tracked schema migrations, or read a database and write its TypeSQL schema.
Run \`typesql migrate --help\` for migration options.

  --dialect postgres  a live PostgreSQL database (--url); the default
  --dialect sqlite    a SQLite database file (--db); the default when --db is given

Run \`typesql introspect --dialect <name> --help\` for the options of each dialect.
`;

interface Io {
	readonly stdout: (s: string) => void;
	readonly stderr: (s: string) => void;
}

const defaultIo = (): Io => ({
	stdout: (s) => process.stdout.write(s),
	stderr: (s) => process.stderr.write(s),
});

const isDialect = (s: string): s is Dialect => s in DIALECTS;

export async function main(
	argv: readonly string[],
	io: Io = defaultIo(),
): Promise<number> {
	if (argv[0] === "migrate") {
		const { main: migrate } = await import("./migrate.js");
		return migrate(argv.slice(1), io);
	}
	const rest: string[] = [];
	let dialect: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (a === "--dialect") {
			dialect = argv[++i];
			if (dialect === undefined) {
				io.stderr(`option '--dialect <name>' argument missing\n\n${USAGE}`);
				return 2;
			}
		} else if (a.startsWith("--dialect=")) dialect = a.slice(10);
		else rest.push(a);
	}
	if (dialect === undefined) {
		const help = rest.some((a) => a === "--help" || a === "-h");
		if (help || rest.length === 0) {
			(help ? io.stdout : io.stderr)(USAGE);
			return help ? 0 : 2;
		}
		dialect = rest.some((a) => a === "--db" || a.startsWith("--db="))
			? "sqlite"
			: "postgres";
	}
	if (!isDialect(dialect)) {
		io.stderr(
			`unknown dialect: ${dialect} (expected postgres or sqlite)\n\n${USAGE}`,
		);
		return 2;
	}
	return DIALECTS[dialect](rest);
}
