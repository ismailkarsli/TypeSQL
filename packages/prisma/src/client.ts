import type { PrismaPromise } from "@prisma/client/runtime/client";
import type { Executor } from "@typesql/core";
import {
	JsonParam,
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

type Compile = (
	text: string,
	values: readonly unknown[],
) => { readonly text: string; readonly values: readonly unknown[] };

const numbered: Compile = (text, values) => ({ text, values });

const jsonText = (value: unknown): unknown =>
	value instanceof JsonParam ? JSON.stringify(value.value) : value;

const sqlite: Compile = (text, values) => positional(text, values, jsonText);

export function executor(
	prisma: PrismaRawClient,
	options: { readonly dialect?: "postgres" | "sqlite" } = {},
): Executor {
	const compile = options.dialect === "sqlite" ? sqlite : numbered;
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
