import type { CacheDialect } from "../cache/dialect.js";
import { scanNames } from "../cache/scan.js";

export const sqliteCache: CacheDialect = {
	name: "sqlite",
	dir: "sqlite",
	typesName: "Sqlite",
	engine: "@typesql/core/sqlite/engine",
	specifiers: [
		"@typesql/core/sqlite/engine",
		"@typesql/core/sqlite",
		"@typesql/core",
	],
	versionFile: "sqlite/engine/cache",
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
	looksLikeQuery: /^\s*(select|with|insert|replace|update|delete|values)\b/i,
	looksLikeDdl: /^\s*(create|alter|drop)\b/i,
	wordSlots: ["relci", "fnci", "catci"],
	scanNames: (text) => scanNames(text, { caseInsensitive: true }),
	touchesAllTables: () => false,
};
