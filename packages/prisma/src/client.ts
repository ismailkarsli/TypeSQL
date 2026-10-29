import type { PrismaPromise } from "@prisma/client/runtime/client";
import type { Executor } from "@typesql/core";
import { runTransaction, type SqlDriver } from "@typesql/core/adapter";

export interface PrismaRawClient {
	$queryRawUnsafe<T = unknown>(
		query: string,
		...values: any[]
	): PrismaPromise<T>;
	$executeRawUnsafe(query: string, ...values: any[]): PrismaPromise<number>;
	$transaction?<R>(fn: (tx: PrismaRawClient) => Promise<R>): Promise<R>;
}

export function executor(prisma: PrismaRawClient): Executor {
	return Object.assign(
		(text: string, values: readonly unknown[]) =>
			prisma.$queryRawUnsafe<unknown[]>(text, ...values),
		{
			count: (text: string, values: readonly unknown[]) =>
				prisma.$executeRawUnsafe(text, ...values),
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

export const driver: SqlDriver<PrismaRawClient> = { executor, transaction };
