import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { type Database, startDockerPostgres } from "../conformance/db.js";
import { Connection } from "./replay.js";

/** What `abs_srcdir` points at: the regression tests' directory, mounted for server-side COPY. */
export const REGRESS_MOUNT = "/regress";
export const regressDir = resolve(
	import.meta.dirname,
	"../../../../vendor/postgres/src/test/regress",
);

interface RegressionFixture {
	readonly directory: string;
	close(): void;
}

/** Restore a sparse checkout's tracked data into a temporary mount, keeping vendor untouched. */
export function regressionFixture(directory: string): RegressionFixture | null {
	if (!existsSync(join(directory, "sql"))) return null;
	if (existsSync(join(directory, "data")))
		return { directory, close: () => {} };
	const temporary = mkdtempSync(join(tmpdir(), "typesql-pg-regress-"));
	const close = () => rmSync(temporary, { recursive: true, force: true });
	try {
		// PostgreSQL runs under a different UID inside Docker and must traverse the mount root.
		chmodSync(temporary, 0o755);
		const root = execFileSync(
			"git",
			["-C", directory, "rev-parse", "--show-toplevel"],
			{
				encoding: "utf8",
			},
		).trim();
		const path = relative(root, directory).split(sep).join("/");
		const archive = execFileSync("git", ["-C", root, "archive", "HEAD", path], {
			maxBuffer: 64 * 1024 * 1024,
		});
		execFileSync(
			"tar",
			["-x", "-C", temporary, `--strip-components=${path.split("/").length}`],
			{
				input: archive,
			},
		);
		if (!existsSync(join(temporary, "data")))
			throw new Error("the tracked regression fixture has no data directory");
		return { directory: temporary, close };
	} catch (error) {
		close();
		throw error;
	}
}

/** Exercise server-side COPY as the database user before trusting a regression replay. */
export async function verifyRegressionData(url: string): Promise<void> {
	const connection = new Connection(url);
	try {
		const columns = Array.from({ length: 16 }, (_, i) => `c${i} text`).join(
			", ",
		);
		await connection.exec(
			`CREATE TEMP TABLE __typesql_regress_seed_check (${columns})`,
		);
		await connection.exec(
			`COPY __typesql_regress_seed_check FROM '${REGRESS_MOUNT}/data/tenk.data'`,
		);
		const rows = await connection.sql.unsafe<{ count: number }[]>(
			"SELECT count(*)::int AS count FROM __typesql_regress_seed_check",
		);
		if (rows[0]?.count !== 10_000)
			throw new Error(
				`expected 10000 rows in tenk.data, got ${rows[0]?.count}`,
			);
	} finally {
		await connection.close();
	}
}

export async function acquireOracleServer(): Promise<Database | null> {
	const url = process.env["TYPESQL_ORACLE_URL"];
	const parts = (process.env["TYPESQL_ORACLE_PARTS"] ?? "").split(",");
	const replay = parts.includes("regress") || parts.includes("ddl");
	if (url) {
		if (replay) await verifyRegressionData(url);
		return { url, source: "env", close: async () => {} };
	}
	if (process.env["TYPESQL_ORACLE"] === "skip") return null;
	let fixture: RegressionFixture | null = null;
	let server: Database | undefined;
	try {
		fixture = regressionFixture(regressDir);
		const mount = fixture
			? ["-v", `${fixture.directory}:${REGRESS_MOUNT}:ro`]
			: [];
		const running = await startDockerPostgres(
			process.env["TYPESQL_PG_IMAGE"] ?? "postgres:18",
			mount,
		);
		server = running;
		if (replay) await verifyRegressionData(running.url);
		return {
			url: running.url,
			source: running.source,
			close: async () => {
				try {
					await running.close();
				} finally {
					fixture?.close();
				}
			},
		};
	} catch (err) {
		await server?.close();
		fixture?.close();
		throw new Error(
			`The oracle needs PostgreSQL: set TYPESQL_ORACLE_URL or make Docker available (TYPESQL_ORACLE=skip skips the run). ${(err as Error).message}`,
		);
	}
}
