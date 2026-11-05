import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { main as mysql } from "@typesql/mysql/introspect";
import { main as postgres } from "@typesql/pg/introspect";
import { main as sqlite } from "@typesql/sqlite/introspect";

export type Dialect = "postgres" | "sqlite" | "mysql" | "mariadb";

// MariaDB is introspected like MySQL; the server reports which one it is.
const DIALECTS: Readonly<
	Record<Dialect, (argv: readonly string[]) => Promise<number>>
> = { postgres, sqlite, mysql, mariadb: mysql };

const USAGE = `Usage: typesql migrate <latest|up|down|status|make name|generate> [options]
       typesql introspect [--dialect postgres|sqlite|mysql|mariadb] [options]
       typesql --version

Run tracked schema migrations, or read a database and write its TypeSQL schema.
Run \`typesql migrate --help\` for migration options.

  --dialect postgres  a live PostgreSQL database (--url); the default
  --dialect sqlite    a SQLite database file (--db); the default when --db is given
  --dialect mysql     a live MySQL database (--url); the default for mysql:// URLs
  --dialect mariadb   a live MariaDB database (--url); the default for mariadb:// URLs

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

const isDialect = (s: string): s is Dialect => Object.hasOwn(DIALECTS, s);

const parse = (argv: readonly string[]) =>
	parseArgs({
		args: [...argv],
		allowPositionals: true,
		// Each dialect's command parser validates the forwarded options.
		strict: false,
		tokens: true,
		options: {
			dialect: { type: "string" },
			db: { type: "string" },
			url: { type: "string" },
			help: { type: "boolean", short: "h" },
			version: { type: "boolean", short: "v" },
		},
	});

export async function main(
	argv: readonly string[],
	io: Io = defaultIo(),
): Promise<number> {
	if (argv[0] === "migrate") {
		const { main: migrate } = await import("./migrate.js");
		return migrate(argv.slice(1), io);
	}
	let parsed: ReturnType<typeof parse>;
	try {
		parsed = parse(argv);
	} catch (error) {
		io.stderr(
			`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`,
		);
		return 2;
	}
	const { values, tokens, positionals } = parsed;
	if (values.version === true && positionals.length === 0) {
		const pkg: { readonly version?: unknown } = createRequire(import.meta.url)(
			"../package.json",
		);
		io.stdout(`${String(pkg.version)}\n`);
		return 0;
	}
	const help = values.help === true;
	const consumed = new Set<number>();
	for (const token of tokens) {
		if (token.kind !== "option" || token.name !== "dialect") continue;
		if (token.value === undefined) {
			io.stderr(`option '--dialect <name>' argument missing\n\n${USAGE}`);
			return 2;
		}
		consumed.add(token.index);
		if (!token.inlineValue) consumed.add(token.index + 1);
	}
	const rest = argv.filter((_, index) => !consumed.has(index));
	let dialect = values.dialect;
	if (dialect === undefined) {
		if (rest.length === 0) {
			io.stderr(`missing command: expected migrate or introspect\n\n${USAGE}`);
			return 2;
		}
		// `typesql introspect --help` shows the default dialect's options.
		if (help && positionals[0] !== "introspect") {
			io.stdout(USAGE);
			return 0;
		}
		const scheme =
			typeof values.url === "string"
				? /^(mysql|mariadb):/i.exec(values.url)?.[1]?.toLowerCase()
				: undefined;
		dialect = values.db === undefined ? (scheme ?? "postgres") : "sqlite";
	}
	if (typeof dialect !== "string" || !isDialect(dialect)) {
		io.stderr(
			`unknown dialect: ${dialect} (expected postgres, sqlite, mysql or mariadb)\n\n${USAGE}`,
		);
		return 2;
	}
	return DIALECTS[dialect](rest);
}
