import type { AnyErr, SqlError } from "../errors.js";
import { Migrations } from "../migrations.js";
import type { Sqlite } from "./dialect.js";
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

export type SqliteMigrations<DB = {}> = Migrations<Sqlite, DB>;

export function migrations<Base = {}>(): SqliteMigrations<Base> {
	return new Migrations<Sqlite, Base>();
}
