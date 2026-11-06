// The database servers of the scenario tests, which the generators of
// PostgreSQL catalog sources read too.
import { readFileSync } from "node:fs";

export type Server = "postgres" | "mysql" | "mariadb";

/** The database servers compose.yaml starts: its image tags and ports pin their versions and default URLs. */
export const SERVERS: Record<
	Server,
	{ variable: string; url: string; version: string }
> = (() => {
	const compose = readFileSync(
		new URL("../tests/compose.yaml", import.meta.url),
		"utf8",
	);
	const service = (name: Server) => {
		const body = new RegExp(`^  ${name}:\\n((?: {4}.*\\n)+)`, "m").exec(
			compose,
		)?.[1];
		const field = (pattern: RegExp) => {
			const value = body && pattern.exec(body)?.[1];
			if (!value) throw new Error(`compose.yaml: ${name} has no ${pattern}`);
			return value;
		};
		return {
			version: field(/^ {4}image: [^:\s]+:([^@\s]+)/m),
			port: field(/^ {6}- "127\.0\.0\.1:(\d+):\d+"/m),
			password: field(/^ {6}\w+_PASSWORD: (\S+)/m),
		};
	};
	const pg = service("postgres");
	const mysql = service("mysql");
	const mariadb = service("mariadb");
	return {
		postgres: {
			variable: "TYPESQL_DATABASE_URL",
			url: `postgres://postgres:${pg.password}@127.0.0.1:${pg.port}/postgres`,
			version: pg.version,
		},
		// mysql2 connects to both MySQL-protocol servers with a `mysql://` URL.
		mysql: {
			variable: "TYPESQL_MYSQL_URL",
			url: `mysql://root:${mysql.password}@127.0.0.1:${mysql.port}/mysql`,
			version: mysql.version,
		},
		mariadb: {
			variable: "TYPESQL_MARIADB_URL",
			url: `mysql://root:${mariadb.password}@127.0.0.1:${mariadb.port}/mysql`,
			version: mariadb.version,
		},
	};
})();

/** The server's admin URL: its environment variable, or the compose.yaml server. */
export const serverUrl = (server: Server) =>
	process.env[SERVERS[server].variable] ?? SERVERS[server].url;
