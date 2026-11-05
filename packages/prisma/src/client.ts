import type { PrismaPromise } from "@prisma/client/runtime/client";
import type { Executor } from "@typesql/core";
import {
	JsonParam,
	mysqlPositional,
	positional,
	runTransaction,
	type SqlDriver,
} from "@typesql/core/adapter";

export interface PrismaRawClient {
	$queryRawUnsafe<T = unknown>(
		query: string,
		...values: any[]
	): PrismaPromise<T>;
	$executeRawUnsafe(query: string, ...values: any[]): PrismaPromise<number>;
	$transaction?<R>(fn: (tx: PrismaRawClient) => Promise<R>): Promise<R>;
}

// Prisma sends a JS array as a Postgres array and a string as text, so send
// every sql.json() value as its JSON.stringify string.
const jsonText = <V>(value: V): V | string =>
	value instanceof JsonParam ? JSON.stringify(value.value) : value;

type DialectName = "postgres" | "sqlite" | "mysql" | "mariadb";

/** The dialect of the client's active provider; MariaDB is Prisma's `mysql`. */
const providerOf = (prisma: PrismaRawClient): DialectName => {
	const provider =
		"_activeProvider" in prisma ? prisma._activeProvider : undefined;
	return provider === "sqlite" || provider === "mysql" ? provider : "postgres";
};

/**
 * An executor on `prisma`. SQLite's placeholders are used when `dialect` is
 * `"sqlite"` and MySQL's when it is `"mysql"` or `"mariadb"`; without
 * `dialect`, those of the client's provider.
 */
export function executor(
	prisma: PrismaRawClient,
	options: { readonly dialect?: DialectName } = {},
): Executor {
	const dialect = options.dialect ?? providerOf(prisma);
	const compile =
		dialect === "sqlite"
			? (text: string, values: readonly unknown[]) =>
					positional(text, values, jsonText)
			: dialect === "mysql" || dialect === "mariadb"
				? mysqlPositional
				: (text: string, values: readonly unknown[]) => ({
						text,
						values: values.map(jsonText),
					});
	return Object.assign(
		(text: string, values: readonly unknown[]) => {
			const q = compile(text, values);
			return prisma.$queryRawUnsafe<unknown[]>(q.text, ...q.values);
		},
		{
			count: (text: string, values: readonly unknown[]) => {
				const q = compile(text, values);
				return prisma.$executeRawUnsafe(q.text, ...q.values);
			},
		},
	);
}

function transaction<T>(
	prisma: PrismaRawClient,
	depth: number,
	fn: (tx: PrismaRawClient) => Promise<T>,
): Promise<T> {
	if (prisma.$transaction) return prisma.$transaction(fn);
	return runTransaction(
		(statement) => prisma.$executeRawUnsafe(statement),
		() => fn(prisma),
		{ savepoint: `typesql_${depth + 1}` },
	);
}

export const driver: SqlDriver<PrismaRawClient> = {
	executor: (prisma) => executor(prisma),
	transaction,
};

export const sqliteDriver: SqlDriver<PrismaRawClient> = {
	executor: (prisma) => executor(prisma, { dialect: "sqlite" }),
	transaction,
};

export const mysqlDriver: SqlDriver<PrismaRawClient> = {
	executor: (prisma) => executor(prisma, { dialect: "mysql" }),
	transaction,
};
