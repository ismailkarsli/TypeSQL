// Shared by the generators of PostgreSQL catalog sources in @typesql/core.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { serverUrl } from "./servers.ts";

/** Connects to `TYPESQL_DATABASE_URL`, or to the PostgreSQL server of tests/compose.yaml. */
export async function withPostgres<T>(
	fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
	const client = new pg.Client({ connectionString: serverUrl("postgres") });
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end();
	}
}

/** Writes a generated source, or with `--check` fails when the committed one differs. */
export function emit(output: URL, source: string, summary: string) {
	const path = fileURLToPath(output);
	if (!process.argv.includes("--check")) {
		writeFileSync(output, source);
		console.log(`wrote ${path} (${summary})`);
	} else if (readFileSync(output, "utf8") !== source) {
		console.error(`${path} is out of date; run without --check to regenerate`);
		process.exitCode = 1;
	}
}
