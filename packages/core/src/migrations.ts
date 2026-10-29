import type { ApplyDdlOf, DialectTypes, ValidateDdlOf } from "./dialect.js";

type GateValidateDdl<T extends DialectTypes, DB, Q extends string> = [
	DB,
	Q,
] extends [infer D, infer Q2 extends string]
	? ValidateDdlOf<T, D, Q2>
	: never;

export class Migrations<T extends DialectTypes, DB = {}> {
	declare readonly schema: DB;
	readonly statements: readonly string[];

	constructor(statements: readonly string[] = []) {
		this.statements = Object.freeze([...statements]);
		Object.freeze(this);
	}

	add<const Q extends string>(
		ddl: GateValidateDdl<T, DB, Q> & Q,
	): Migrations<T, ApplyDdlOf<T, DB, Q>> {
		return new Migrations([...this.statements, ddl]);
	}

	raw<After = DB>(sql: string): Migrations<T, After> {
		return new Migrations<T, After>([...this.statements, sql]);
	}
}

export type SchemaOf<M extends { readonly schema: unknown }> = M["schema"];

export interface MigrationClient {
	query(text: string): Promise<unknown>;
}

export async function runMigrations(
	client: MigrationClient,
	m: { readonly statements: readonly string[] },
): Promise<void> {
	await client.query("BEGIN");
	try {
		for (const text of m.statements) await client.query(text);
		await client.query("COMMIT");
	} catch (err) {
		try {
			await client.query("ROLLBACK");
		} catch {}
		throw err;
	}
}
