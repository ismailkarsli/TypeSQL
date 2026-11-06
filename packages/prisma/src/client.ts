import type { PrismaPromise } from "@prisma/client/runtime/client";
import type { Executor } from "@typesql/core";
import {
	type DialectFamily,
	dialectFamily,
	familyStatement,
	jsonText,
	runTransaction,
	type SqlDriver,
} from "@typesql/core/adapter";
import { providerDialect } from "./provider.js";

export interface PrismaRawClient {
	$queryRawUnsafe<T = unknown>(
		query: string,
		...values: any[]
	): PrismaPromise<T>;
	$executeRawUnsafe(query: string, ...values: any[]): PrismaPromise<number>;
	$transaction?<R>(fn: (tx: PrismaRawClient) => Promise<R>): Promise<R>;
}

const providerOf = (prisma: PrismaRawClient): DialectFamily =>
	providerDialect(
		"_activeProvider" in prisma && typeof prisma._activeProvider === "string"
			? prisma._activeProvider
			: undefined,
	);

// Prisma sends a JS array as a Postgres array and a string as text, so
// sql.json() values are sent as JSON text; its MySQL adapter takes them as
// mysqlValue converts them.
const compile = (
	family: DialectFamily,
	text: string,
	values: readonly unknown[],
) =>
	familyStatement[family](
		text,
		values,
		family === "mysql" ? undefined : jsonText,
	);

/**
 * An executor on `prisma`. SQLite's placeholders are used when `dialect` is
 * `"sqlite"` and MySQL's when it is `"mysql"` or `"mariadb"`; without
 * `dialect`, those of the client's provider.
 */
export function executor(
	prisma: PrismaRawClient,
	options: { readonly dialect?: DialectFamily | "mariadb" } = {},
): Executor {
	const family = options.dialect
		? dialectFamily(options.dialect)
		: providerOf(prisma);
	return Object.assign(
		(text: string, values: readonly unknown[]) => {
			const q = compile(family, text, values);
			return prisma.$queryRawUnsafe<unknown[]>(q.text, ...q.values);
		},
		{
			count: (text: string, values: readonly unknown[]) => {
				const q = compile(family, text, values);
				return prisma.$executeRawUnsafe(q.text, ...q.values);
			},
		},
	);
}

function transaction<T>(
	prisma: PrismaRawClient,
	_depth: number,
	fn: (tx: PrismaRawClient) => Promise<T>,
	savepoint: string | undefined,
): Promise<T> {
	if (savepoint === undefined && prisma.$transaction)
		return prisma.$transaction(fn);
	return runTransaction(
		(statement) => prisma.$executeRawUnsafe(statement),
		() => fn(prisma),
		{ savepoint },
	);
}

/** The driver for a `sql` of the dialect family `dialect`. */
export const driverOf = (
	dialect: DialectFamily,
): SqlDriver<PrismaRawClient> => ({
	executor: (prisma) => executor(prisma, { dialect }),
	transaction,
	// An interactive transaction's client has no $transaction.
	inTransaction: (prisma) => !prisma.$transaction,
});
