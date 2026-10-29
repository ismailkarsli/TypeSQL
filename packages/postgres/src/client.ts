import type { Executor } from "@typesql/core";
import type { SqlDriver } from "@typesql/core/adapter";

export type PostgresJsRows = readonly unknown[] & {
	readonly count: number | null;
};

export interface PostgresJsQueryable {
	unsafe(
		query: string,
		parameters?: unknown[],
		options?: { readonly prepare: boolean; readonly simple: boolean },
	): PromiseLike<PostgresJsRows>;
}

export interface PostgresJsTransactable<
	Tx extends PostgresJsQueryable = PostgresJsQueryable,
> {
	begin(fn: (tx: Tx) => Promise<unknown>): Promise<unknown>;
}

interface PostgresJsSavepointable {
	savepoint(
		fn: (tx: PostgresJsQueryable) => Promise<unknown>,
	): Promise<unknown>;
}

export function executor(sql: PostgresJsQueryable): Executor {
	const run: Executor = async (text, values) => {
		const result = await sql.unsafe(text, Array.from(values));
		return { rows: Array.from(result), rowCount: result.count ?? null };
	};
	return Object.assign(run, {
		prepare: (): Executor => async (text, values) => {
			const result = await sql.unsafe(text, Array.from(values), {
				prepare: true,
				simple: false,
			});
			return { rows: Array.from(result), rowCount: result.count ?? null };
		},
	});
}

async function transaction<T>(
	sql: PostgresJsQueryable,
	_depth: number,
	fn: (tx: PostgresJsQueryable) => Promise<T>,
): Promise<T> {
	const { savepoint, begin } = sql as Partial<
		PostgresJsSavepointable & PostgresJsTransactable
	>;
	if (savepoint) return (await savepoint.call(sql, fn)) as T;
	if (begin) return (await begin.call(sql, fn)) as T;
	throw new Error(
		"typesql: sql.transaction() needs a postgres.js Sql, ReservedSql or TransactionSql (with begin or savepoint)",
	);
}

export const driver: SqlDriver<PostgresJsQueryable> = { executor, transaction };

export interface MigrationSource {
	readonly statements: readonly string[];
}

export async function migrate<Tx extends PostgresJsQueryable>(
	sql: PostgresJsTransactable<Tx>,
	m: MigrationSource,
): Promise<void> {
	await sql.begin(async (tx) => {
		for (const statement of m.statements) await tx.unsafe(statement);
	});
}
