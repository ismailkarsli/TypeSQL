import type { DialectFamily } from "@typesql/core/adapter";

/**
 * The dialect family of a Prisma datasource provider, PostgreSQL's when it
 * isn't known. The postgresql, sqlite and mysql providers are supported
 * (MariaDB is Prisma's mysql); any other throws.
 */
export function providerDialect(provider: string | undefined): DialectFamily {
	switch (provider) {
		case undefined:
		case "postgresql":
		case "postgres":
			return "postgres";
		case "sqlite":
		case "mysql":
			return provider;
		default:
			throw new Error(
				`@typesql/prisma: only the postgresql, sqlite and mysql providers are supported (got "${provider}")`,
			);
	}
}
