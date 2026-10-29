import type { AnyErr, SqlError } from "./engine/errors.js";
import type { ApplyDdl } from "./engine/infer.js";

export type ValidateDdl<DB, Q extends string> = string extends Q
	? SqlError<
			"migrations need a string literal; use .raw() for SQL the type checker cannot see",
			null
		>
	: ApplyDdl<DB, Q> extends infer R
		? R extends AnyErr
			? R
			: Q
		: never;

type GateValidateDdl<DB, Q extends string> = [DB, Q] extends [
	infer D,
	infer Q2 extends string,
]
	? ValidateDdl<D, Q2>
	: never;

export class Migrations<DB = {}> {
	declare readonly schema: DB;
	readonly statements: readonly string[];

	constructor(statements: readonly string[] = []) {
		this.statements = Object.freeze([...statements]);
		Object.freeze(this);
	}

	add<const Q extends string>(
		ddl: GateValidateDdl<DB, Q> & Q,
	): Migrations<ApplyDdl<DB, Q>> {
		return new Migrations([...this.statements, ddl]);
	}

	raw<After = DB>(sql: string): Migrations<After> {
		return new Migrations<After>([...this.statements, sql]);
	}
}

export function migrations<Base = {}>(): Migrations<Base> {
	return new Migrations<Base>();
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
