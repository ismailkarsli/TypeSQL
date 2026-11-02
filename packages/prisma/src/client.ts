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

// Prisma sends a JS array as a Postgres array and a string as text, so send
// every sql.json() value as its JSON.stringify string.
const jsonText = (value: unknown): unknown =>
	value instanceof JsonParam ? JSON.stringify(value.value) : value;

const numbered: Compile = (text, values) => ({
	text,
	values: values.map(jsonText),
});

const sqlite: Compile = (text, values) => positional(text, values, jsonText);

/**
 * An executor on `prisma`. SQLite's placeholders are used when `dialect` is
 * `"sqlite"`, or, without `dialect`, when the client's provider is SQLite.
 */
export function executor(
	prisma: PrismaRawClient,
	options: { readonly dialect?: "postgres" | "sqlite" } = {},
): Executor {
	const onSqlite =
		options.dialect === undefined
			? (prisma as { readonly _activeProvider?: unknown })._activeProvider ===
				"sqlite"
			: options.dialect === "sqlite";
	const compile = onSqlite ? sqlite : numbered;
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
