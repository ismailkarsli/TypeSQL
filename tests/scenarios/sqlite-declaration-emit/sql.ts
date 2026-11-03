import { DatabaseSync } from "node:sqlite";
import {
	CasePlugin,
	type IdentityPluginTypes,
	type SqlPlugin,
} from "@typesql/core";
import {
	createTransactionalSql,
	serialTransaction,
} from "@typesql/core/adapter";
import {
	type Col,
	type DefaultTypeMap,
	type Sqlite,
	sqlite,
} from "@typesql/core/sqlite";
import { executor, type SqliteDatabase } from "@typesql/sqlite";

interface DB {
	subscriptions: {
		id: Col<"integer">;
		user_id: Col<"text">;
		plan_name: Col<"text">;
		ended_at: Col<"text", { nullable: true }>;
	};
}

interface TypeMap extends Omit<DefaultTypeMap, "integer"> {
	integer: bigint;
}

interface FrozenRowTypes extends IdentityPluginTypes {
	readonly output: Readonly<this["value"]>;
}

class FrozenRows implements SqlPlugin<FrozenRowTypes> {
	declare readonly types?: FrozenRowTypes;
	#frozen = 0;
	private freeze<Row>(row: Row): Readonly<Row> {
		this.#frozen++;
		return Object.freeze(row);
	}
	get frozen(): number {
		return this.#frozen;
	}
	transformOutput<Row>(row: Row): Readonly<Row> {
		return this.freeze(row);
	}
}

export const db = new DatabaseSync(process.env.SQLITE_PATH!);

export const sql = createTransactionalSql<Sqlite, DB, TypeMap, SqliteDatabase>(
	sqlite,
	db,
	{
		executor: (client) => executor(client, { bigint: true }),
		transaction: (client, depth, fn) =>
			serialTransaction(
				client,
				depth,
				async (statement) => {
					client.exec(statement);
				},
				() => fn(client),
			),
	},
)
	.withPlugin(new CasePlugin())
	.withPlugin(new FrozenRows());
