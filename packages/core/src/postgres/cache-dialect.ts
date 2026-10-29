import type { CacheDialect } from "../cache/dialect.js";

export const postgresCache: CacheDialect = {
	name: "postgres",
	engine: "@typesql/core/postgres/engine",
	specifiers: [
		"@typesql/core/postgres/engine",
		"@typesql/core/postgres",
		"@typesql/core",
	],
	versionFile: "postgres/engine/cache",
	sqlTypes: ["Sql", "TransactionalSql"],
	queryAliases: {
		RowOf: 2,
		ParamsOf: 2,
		ArgsOf: 2,
		ParamsArgs: 2,
		Validate: 1,
		KindOf: 1,
		NamesOf: 1,
		Analysis: 1,
	},
	ddlAliases: { ApplyDdl: 1, ValidateDdl: 1 },
	looksLikeQuery:
		/^\s*(\(\s*)*(select|with|insert|update|delete|values|table)\b/i,
	looksLikeDdl: /^\s*(create|alter|drop|comment)\b/i,
	touchesAllTables: (text) => /\b(drop|alter)\s+type\b/i.test(text),
};
