import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import pg from "pg";

export type Database = "postgres" | "sqlite" | "mysql" | "mariadb";

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

/** The MySQL-protocol servers: mysql2 connects to both with a `mysql://` URL. */
const SERVERS = {
	mysql: {
		variable: "TYPESQL_MYSQL_URL",
		url: "mysql://root:typesql@127.0.0.1:53306/mysql",
		scheme: "mysql",
		version: /^8\.4\./,
		expected: "MySQL 8.4",
	},
	mariadb: {
		variable: "TYPESQL_MARIADB_URL",
		url: "mysql://root:typesql@127.0.0.1:53307/mysql",
		scheme: "mariadb",
		version: /^11\.8\.\d+-MariaDB/,
		expected: "MariaDB 11.8",
	},
} as const;
type Server = keyof typeof SERVERS;

const serverUrl = (kind: Server) =>
	process.env[SERVERS[kind].variable] ?? SERVERS[kind].url;
async function mysqlAdmin<T>(
	kind: Server,
	fn: (connection: mysql.Connection) => Promise<T>,
) {
	const connection = await mysql.createConnection({
		uri: serverUrl(kind),
		connectTimeout: 5000,
	});
	try {
		return await fn(connection);
	} finally {
		await connection.end();
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
	for (const kind of ["mysql", "mariadb"] as const) {
		const server = SERVERS[kind];
		try {
			await mysqlAdmin(kind, async (connection) => {
				const [rows] = await connection.query<mysql.RowDataPacket[]>(
					"SELECT VERSION() AS version",
				);
				const version = String(rows[0]?.version);
				if (!server.version.test(version))
					throw new Error(`Expected ${server.expected}: ${version}`);
			});
		} catch (cause) {
			throw new Error(
				`Infrastructure: pinned ${server.expected} is not ready`,
				{
					cause,
				},
			);
		}
	}
}
export async function allocate(kind: Database | undefined, directory: string) {
	if (kind === "mysql" || kind === "mariadb")
		return allocateMysql(kind, directory);
	if (kind !== "postgres")
		return {
			env: { SQLITE_PATH: joinSqlite(directory) },
			cleanup: async () => {},
		};
	const name = `scenario_${randomUUID().replaceAll("-", "")}`;
	await admin(async (client) => {
		for (const statement of [
			`CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
			`ALTER DATABASE "${name}" SET timezone TO 'UTC'`,
			`ALTER DATABASE "${name}" SET datestyle TO 'ISO, YMD'`,
		])
			await client.query(statement);
	});
	const url = new URL(adminUrl());
	url.pathname = `/${name}`;
	return {
		env: { DATABASE_URL: url.toString(), SQLITE_PATH: joinSqlite(directory) },
		cleanup: () =>
			admin((client) =>
				client.query(`DROP DATABASE "${name}" WITH (FORCE)`).then(() => {}),
			),
	};
}
/**
 * A database of its own on the MySQL or MariaDB server. Its URL carries the
 * server's scheme (`mysql://` or `mariadb://`), which the drivers and the CLI
 * accept.
 */
async function allocateMysql(kind: Server, directory: string) {
	const name = `scenario_${randomUUID().replaceAll("-", "")}`;
	await mysqlAdmin(kind, async (connection) => {
		await connection.query(
			`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`,
		);
	});
	const url = new URL(serverUrl(kind));
	url.pathname = `/${name}`;
	return {
		env: {
			DATABASE_URL: url
				.toString()
				.replace(/^mysql:/, `${SERVERS[kind].scheme}:`),
			SQLITE_PATH: joinSqlite(directory),
		},
		cleanup: () =>
			mysqlAdmin(kind, async (connection) => {
				await connection.query(`DROP DATABASE \`${name}\``);
			}),
	};
}
const joinSqlite = (directory: string) => `${directory}/app.db`;
