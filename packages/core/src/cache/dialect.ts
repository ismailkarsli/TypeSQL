export interface CacheDialect {
	readonly name: string;
	readonly engine: string;
	readonly specifiers: readonly string[];
	readonly versionFile: string;
	readonly sqlTypes: readonly string[];
	readonly queryAliases: { readonly [alias: string]: number };
	readonly ddlAliases: { readonly [alias: string]: number };
	readonly looksLikeQuery: RegExp;
	readonly looksLikeDdl: RegExp;
	touchesAllTables(text: string): boolean;
}
