import * as core from "@typesql/core";
import * as adapter from "@typesql/core/adapter";
import * as postgres from "@typesql/core/postgres";
import * as sqlite from "@typesql/core/sqlite";
import * as pgEngine from "@typesql/core/postgres/engine";
import * as sqliteEngine from "@typesql/core/sqlite/engine";
import * as migrations from "@typesql/core/migration";
import * as pgIntrospect from "@typesql/pg/introspect";
import * as sqliteIntrospect from "@typesql/sqlite/introspect";
import * as generator from "@typesql/prisma/generator";
import { main } from "@typesql/cli";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
console.log({
	createSql: typeof core.createSql,
	positional: typeof adapter.positional,
	postgres: postgres.postgres.name,
	sqlite: sqlite.sqlite.name,
	pgEngine: Object.keys(pgEngine),
	sqliteEngine: Object.keys(sqliteEngine),
	migrations: typeof migrations.createMigrator,
	pgIntrospect: typeof pgIntrospect.introspect,
	sqliteIntrospect: typeof sqliteIntrospect.introspect,
	generateSource: typeof generator.generateSource,
	cli: typeof main,
	requireEsm: typeof require("@typesql/core").createSql,
});
