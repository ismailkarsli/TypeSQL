import { randomUUID } from "node:crypto";
import { join } from "node:path";
import mysql from "mysql2/promise";
import pg from "pg";
import { SERVERS, type Server, serverUrl } from "../../tools/servers.ts";
import type { Database } from "./types.ts";

/** Runs statements on the server's admin connection, returning the last one's rows. */
async function admin(server: Server, statements: string[]): Promise<unknown[]> {
	let rows: unknown[] = [];
	if (server === "postgres") {
		const client = new pg.Client({
			connectionString: serverUrl(server),
			connectionTimeoutMillis: 5000,
			query_timeout: 10000,
		});
		await client.connect();
		try {
			for (const text of statements) rows = (await client.query(text)).rows;
		} finally {
			await client.end();
		}
		return rows;
	}
	const connection = await mysql.createConnection({
		uri: serverUrl(server),
		connectTimeout: 5000,
	});
	try {
		for (const text of statements)
			[rows] = await connection.query<mysql.RowDataPacket[]>(text);
	} finally {
		await connection.end();
	}
	return rows;
}

const checked = new Map<Server, Promise<void>>();
/** Checks a server once per worker, when the first scenario using it runs. */
function ready(server: Server) {
	let check = checked.get(server);
	if (!check) {
		const { version: expected } = SERVERS[server];
		check = admin(server, ["SELECT version() AS version"])
			.then(([row]) => {
				const version = String(
					typeof row === "object" && row && "version" in row && row.version,
				);
				// PostgreSQL prefixes its version with its name; MySQL and MariaDB do not.
				const number = version.replace(/^PostgreSQL /, "");
				if (
					!new RegExp(`^${expected.replaceAll(".", "\\.")}(?!\\d)`).test(number)
				)
					throw new Error(`Expected ${server} ${expected}: ${version}`);
			})
			.catch((cause) => {
				throw new Error(
					`Infrastructure: pinned ${server} ${expected} is not ready`,
					{ cause },
				);
			});
		checked.set(server, check);
	}
	return check;
}

export interface Allocation {
	env: Record<string, string>;
	cleanup(): Promise<void>;
}

/** A database of the scenario's own: a fresh one on the server, or a SQLite file. */
export async function allocate(
	kind: Database | undefined,
	directory: string,
): Promise<Allocation> {
	if (kind === undefined) return { env: {}, cleanup: async () => {} };
	if (kind === "sqlite")
		return {
			env: { SQLITE_PATH: join(directory, "app.db") },
			cleanup: async () => {},
		};
	await ready(kind);
	const name = `scenario_${randomUUID().replaceAll("-", "")}`;
	const statements =
		kind === "postgres"
			? {
					create: [
						`CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
						`ALTER DATABASE "${name}" SET timezone TO 'UTC'`,
						`ALTER DATABASE "${name}" SET datestyle TO 'ISO, YMD'`,
					],
					drop: `DROP DATABASE "${name}" WITH (FORCE)`,
				}
			: {
					create: [
						`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`,
					],
					drop: `DROP DATABASE \`${name}\``,
				};
	await admin(kind, statements.create);
	const url = new URL(serverUrl(kind));
	url.pathname = `/${name}`;
	return {
		// A MySQL-protocol URL carries the server's scheme (`mysql://` or
		// `mariadb://`), which the drivers and the CLI accept.
		env: {
			DATABASE_URL:
				kind === "postgres"
					? url.toString()
					: url.toString().replace(/^mysql:/, `${kind}:`),
		},
		cleanup: async () => {
			await admin(kind, [statements.drop]);
		},
	};
}
