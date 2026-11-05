import type { AnyErr, SqlError } from "../errors.js";
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
