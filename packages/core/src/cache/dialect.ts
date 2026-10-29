import type { Names } from "./scan.js";

export type WordSlot = "rel" | "relci" | "pg" | "fn" | "fnci" | "cat" | "catci";

export interface CacheDialect {
	readonly name: string;
	readonly dir: string;
	readonly typesName: string;
	readonly engine: string;
	readonly specifiers: readonly string[];
	readonly versionFile: string;
	readonly sqlTypes: readonly string[];
	readonly queryAliases: { readonly [alias: string]: number };
	readonly ddlAliases: { readonly [alias: string]: number };
	readonly looksLikeQuery: RegExp;
	readonly looksLikeDdl: RegExp;
	readonly wordSlots: readonly WordSlot[];
	scanNames(text: string): Names;
	touchesAllTables(text: string): boolean;
}
