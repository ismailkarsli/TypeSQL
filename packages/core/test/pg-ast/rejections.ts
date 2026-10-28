import { readFileSync } from "node:fs";
import { maxParam } from "../../src/runtime/splice.js";
import { type Database, startDockerPostgres } from "../oracle/db.js";
import { Connection, type ServerError } from "../oracle/replay.js";
import type { Statement } from "./statements.js";

interface RejectionCase {
	readonly group: string;
	readonly sql: string;
	readonly ours: string;
	readonly server: ServerError;
}

interface RejectionFixtures {
	readonly postgres: string;
	readonly setup: readonly string[];
	readonly cases: readonly RejectionCase[];
}

const keyOf = (s: { readonly group: string; readonly sql: string }): string =>
	`${s.group}\0${s.sql}`;

/** A server failure only verifies the fixture when its SQLSTATE and message match. */
function fixtureProblem(
	expected: ServerError,
	actual: ServerError | null,
): string | null {
	if (!actual) return "PostgreSQL accepted the statement";
	if (actual.code === expected.code && actual.message === expected.message)
		return null;
	return `expected PostgreSQL ${expected.code} ${expected.message}; got ${actual.code} ${actual.message}`;
}

/** Rejections are checked evidence, never an AST disagreement that --update can baseline. */
export class RejectionAudit {
	private readonly version: string;
	private readonly fixtures: RejectionFixtures;
	private readonly cases = new Map<string, RejectionCase>();
	private readonly seen = new Set<string>();
	private server?: Database;
	private conn?: Connection;

	constructor(version: string) {
		const fixtures = JSON.parse(
			readFileSync(new URL("./rejections.json", import.meta.url), "utf8"),
		) as RejectionFixtures;
		this.version = version;
		this.fixtures = fixtures;
		for (const c of fixtures.cases) {
			const key = keyOf(c);
			if (this.cases.has(key))
				throw new Error(`duplicate rejection fixture: ${c.group}: ${c.sql}`);
			this.cases.set(key, c);
		}
	}

	async verify(s: Statement, ours: string): Promise<string | null> {
		if (s.line !== null)
			return (s.outcome === "error" || s.outcome === "syntax-error") &&
				s.pgError
				? null
				: `official PostgreSQL outcome is ${s.outcome ?? "unknown"}, not a confirmed rejection`;
		const fixture = this.cases.get(keyOf(s));
		if (!fixture)
			return "no rejection fixture: add a reviewed schema and PostgreSQL error to rejections.json";
		this.seen.add(keyOf(s));
		if (ours !== fixture.ours)
			return `TypeSQL's rejection changed: expected ${fixture.ours}; got ${ours}`;
		if (this.fixtures.postgres !== this.version)
			return `rejection fixtures are for PostgreSQL ${this.fixtures.postgres}, vendor/postgres is ${this.version}; re-audit them before updating the version`;
		if (!this.conn) {
			this.server = await startDockerPostgres(`postgres:${this.version}`);
			this.conn = new Connection(this.server.url, {
				settings: { lc_messages: "C" },
			});
			const rows = await this.conn.sql.unsafe<{ version: string }[]>(
				"SELECT current_setting('server_version') AS version",
			);
			if (rows[0]?.version.split(/\s/)[0] !== this.version)
				throw new Error(`rejection audit requires PostgreSQL ${this.version}`);
		}
		await this.conn.exec("BEGIN");
		try {
			// Each case gets the same clean fixture; its writes and roles are rolled back.
			for (const sql of this.fixtures.setup) await this.conn.exec(sql);
			const n = maxParam(s.sql);
			const result = n
				? await this.conn.run(s.sql, Array<string | null>(n).fill(null))
				: await this.conn.runScript(s.sql);
			return fixtureProblem(
				fixture.server,
				"error" in result ? result.error : null,
			);
		} finally {
			await this.conn.exec("ROLLBACK");
		}
	}

	stale(only: readonly string[]): string[] {
		return this.fixtures.cases
			.filter(
				(c) =>
					(!only.length || only.includes(c.group)) && !this.seen.has(keyOf(c)),
			)
			.map((c) => `stale rejection fixture: ${c.group}: ${c.sql}`);
	}

	async close(): Promise<void> {
		try {
			await this.conn?.close();
		} finally {
			await this.server?.close();
		}
	}
}
