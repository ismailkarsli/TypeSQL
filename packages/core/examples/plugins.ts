import {
	CasePlugin,
	createSql,
	type Executor,
	type IdentityPluginTypes,
	type InputContext,
	type RowType,
	type SqlPlugin,
} from "@typesql/core";
import { type Col, type Nullable, postgres } from "@typesql/core/postgres";

type Envelope<T> = { data: T };

/** An example plugin that changes structure, rather than just renaming keys. */
export interface EnvelopeTypes extends IdentityPluginTypes {
	readonly input: this["context"]["kind"] extends "parameters"
		? [args: this["value"]]
		: Envelope<this["value"]>;
	readonly encoded: this["context"]["kind"] extends "parameters"
		? this["value"] extends readonly [infer Args]
			? Args
			: never
		: this["value"] extends { readonly data: infer Data }
			? Data
			: never;
	readonly output: Envelope<this["value"]>;
}

export class EnvelopePlugin implements SqlPlugin<EnvelopeTypes> {
	declare readonly types?: EnvelopeTypes;
	transformInput(value: unknown, context: InputContext): unknown {
		if (context.kind === "parameters") {
			if (!Array.isArray(value) || value.length !== 1)
				throw new Error("Expected one argument tuple");
			return value[0];
		}
		if (value === null || typeof value !== "object" || !("data" in value))
			throw new Error("Expected a data envelope");
		return value.data;
	}
	transformOutput(row: unknown): unknown {
		return { data: row };
	}
}

interface DB {
	users: { id: Col<"int4">; display_name: Nullable<"text"> };
}
const sql = createSql<DB>(postgres)
	.withPlugin(new CasePlugin())
	.withPlugin(new EnvelopePlugin());

export const query = sql("SELECT display_name FROM users WHERE id = $1", [7]);
export type QueryRow = RowType<typeof query>;

export async function readRow(executor: Executor): Promise<QueryRow> {
	return query.executeTakeFirstOrThrow(executor);
}

export const prepared = sql.prepare(
	"SELECT display_name FROM users WHERE id = :id",
);
export const named = prepared([{ id: 7 }]);
export const inserted = sql(
	"INSERT INTO users {rows} RETURNING display_name",
	{
		rows: sql.values("users", [{ data: { id: 7, displayName: null } }]),
	},
	[],
);
export const updated = sql(
	"UPDATE users SET {changes} WHERE id = $1 RETURNING display_name",
	{
		changes: sql.set("users", { data: { displayName: "Ada" } }),
	},
	[7],
);

export async function displayName(executor: Executor): Promise<string | null> {
	const row = await query.executeTakeFirstOrThrow(executor);
	return row.data.displayName;
}
