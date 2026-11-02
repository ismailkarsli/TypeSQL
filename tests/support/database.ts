import { randomUUID } from "node:crypto";
import pg from "pg";

const adminUrl = () =>
	process.env.TYPESQL_DATABASE_URL ??
	"postgres://postgres:typesql@127.0.0.1:55432/postgres";
async function admin<T>(fn: (client: pg.Client) => Promise<T>) {
	const client = new pg.Client({
		connectionString: adminUrl(),
		connectionTimeoutMillis: 5000,
		query_timeout: 10000,
	});
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end();
	}
}
export async function ready() {
	try {
		await admin(async (client) => {
			const { rows } = await client.query("SHOW server_version");
			if (!rows[0].server_version.startsWith("18.6"))
				throw new Error(`Expected PostgreSQL 18.6: ${rows[0].server_version}`);
		});
	} catch (cause) {
		throw new Error("Infrastructure: pinned PostgreSQL is not ready", {
			cause,
		});
	}
}
export async function allocate(
	kind: "postgres" | "sqlite" | undefined,
	directory: string,
) {
	if (kind !== "postgres")
		return {
			env: { SQLITE_PATH: joinSqlite(directory) },
			cleanup: async () => {},
		};
	const name = `scenario_${randomUUID().replaceAll("-", "")}`;
	await admin((client) =>
		client
			.query(
				`CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
			)
			.then(() => {}),
	);
	const url = new URL(adminUrl());
	url.pathname = `/${name}`;
	await admin((client) =>
		client
			.query(`ALTER DATABASE "${name}" SET timezone TO 'UTC'`)
			.then(() => {}),
	);
	await admin((client) =>
		client
			.query(`ALTER DATABASE "${name}" SET datestyle TO 'ISO, YMD'`)
			.then(() => {}),
	);
	return {
		env: { DATABASE_URL: url.toString(), SQLITE_PATH: joinSqlite(directory) },
		cleanup: () =>
			admin((client) =>
				client.query(`DROP DATABASE "${name}" WITH (FORCE)`).then(() => {}),
			),
	};
}
const joinSqlite = (directory: string) => `${directory}/app.db`;
