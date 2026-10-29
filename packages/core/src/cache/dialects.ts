import { postgresCache } from "../postgres/cache-dialect.js";
import { sqliteCache } from "../sqlite/cache-dialect.js";
import type { CacheDialect } from "./dialect.js";

export const DIALECTS: readonly CacheDialect[] = [postgresCache, sqliteCache];

export const dialectNamed = (name: string | undefined): CacheDialect =>
	DIALECTS.find((d) => d.name === name) ?? DIALECTS[0]!;
