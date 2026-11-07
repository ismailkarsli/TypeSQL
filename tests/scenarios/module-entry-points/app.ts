import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import * as betterAuth from "@typesql/better-auth";
import * as cli from "@typesql/cli";
import * as core from "@typesql/core";
import * as coreAdapter from "@typesql/core/adapter";
import * as coreMigration from "@typesql/core/migration";
import * as coreMysql from "@typesql/core/mysql";
import * as coreMysqlEngine from "@typesql/core/mysql/engine";
import * as corePlugins from "@typesql/core/plugins";
import * as corePostgres from "@typesql/core/postgres";
import * as corePostgresEngine from "@typesql/core/postgres/engine";
import * as coreReserved from "@typesql/core/reserved";
import * as coreSqlite from "@typesql/core/sqlite";
import * as coreSqliteEngine from "@typesql/core/sqlite/engine";
import * as drizzle from "@typesql/drizzle";
import * as kysely from "@typesql/kysely";
import * as languageServer from "@typesql/language-server";
import * as languageServerFormat from "@typesql/language-server/format";
import * as mysql from "@typesql/mysql";
import * as mysqlIntrospect from "@typesql/mysql/introspect";
import * as mysqlMariadb from "@typesql/mysql/mariadb";
import * as mysqlPlanetscale from "@typesql/mysql/planetscale";
import * as mysqlTidb from "@typesql/mysql/tidb";
import * as pg from "@typesql/pg";
import * as pgIntrospect from "@typesql/pg/introspect";
import * as postgres from "@typesql/postgres";
import * as prisma from "@typesql/prisma";
import * as prismaGenerator from "@typesql/prisma/generator";
import * as sqlite from "@typesql/sqlite";
import * as sqliteIntrospect from "@typesql/sqlite/introspect";

const require = createRequire(import.meta.url);

// Every public entry point, with the kind of each value it exports.
const entryPoints = {
	"@typesql/better-auth": betterAuth,
	"@typesql/cli": cli,
	"@typesql/core": core,
	"@typesql/core/adapter": coreAdapter,
	"@typesql/core/migration": coreMigration,
	"@typesql/core/mysql": coreMysql,
	"@typesql/core/mysql/engine": coreMysqlEngine,
	"@typesql/core/plugins": corePlugins,
	"@typesql/core/postgres": corePostgres,
	"@typesql/core/postgres/engine": corePostgresEngine,
	"@typesql/core/reserved": coreReserved,
	"@typesql/core/sqlite": coreSqlite,
	"@typesql/core/sqlite/engine": coreSqliteEngine,
	"@typesql/drizzle": drizzle,
	"@typesql/kysely": kysely,
	"@typesql/language-server": languageServer,
	"@typesql/language-server/format": languageServerFormat,
	"@typesql/mysql": mysql,
	"@typesql/mysql/introspect": mysqlIntrospect,
	"@typesql/mysql/mariadb": mysqlMariadb,
	"@typesql/mysql/planetscale": mysqlPlanetscale,
	"@typesql/mysql/tidb": mysqlTidb,
	"@typesql/pg": pg,
	"@typesql/pg/introspect": pgIntrospect,
	"@typesql/postgres": postgres,
	"@typesql/prisma": prisma,
	"@typesql/prisma/generator": prismaGenerator,
	"@typesql/sqlite": sqlite,
	"@typesql/sqlite/introspect": sqliteIntrospect,
};
console.log(
	JSON.stringify(
		Object.fromEntries(
			Object.entries(entryPoints).map(([specifier, module]) => [
				specifier,
				Object.fromEntries(
					Object.entries(module).map(([name, value]) => [name, typeof value]),
				),
			]),
		),
		null,
		2,
	),
);
// Entry points the installed TypeSQL packages declare but this list misses.
interface Manifest {
	name: string;
	private?: boolean;
	main?: string;
	dependencies?: Record<string, string>;
	exports?: Record<string, { types: string; default: string }>;
}
const manifest = (path: string): Manifest =>
	JSON.parse(readFileSync(path, "utf8"));
const dependencies = Object.keys(
	manifest("package.json").dependencies ?? {},
).filter((name) => name.startsWith("@typesql/"));
const declared = dependencies.flatMap((name) => {
	const { exports, main } = manifest(`node_modules/${name}/package.json`);
	return Object.keys(exports ?? (main ? { ".": main } : {})).map(
		(path) => `${name}${path.slice(1)}`,
	);
});
console.log({ unlisted: declared.filter((entry) => !(entry in entryPoints)) });
// Published TypeSQL packages of the workspace the dependencies are installed
// from that this application doesn't depend on.
const workspace = dirname(realpathSync("node_modules/@typesql/core"));
const published = readdirSync(workspace).flatMap((dir) => {
	const path = join(workspace, dir, "package.json");
	try {
		const { name, private: unpublished } = manifest(path);
		return unpublished ? [] : [name];
	} catch {
		return [];
	}
});
console.log({
	undeclared: published.filter((name) => !dependencies.includes(name)),
});
// CommonJS code can require the ES modules.
console.log({ requireEsm: typeof require("@typesql/core").createSql });
