import type { IdentityPluginTypes, SqlPlugin } from "@typesql/core";
import { createTransactionalSql, runTransaction } from "@typesql/core/adapter";
import { CasePlugin } from "@typesql/core/plugins";
import { type Col, type Postgres, postgres } from "@typesql/core/postgres";
import { executor, type PgTypeMap } from "@typesql/pg";
import pg from "pg";

pg.types.setTypeParser(pg.types.builtins.INT8, Number);

interface DB {
	subscriptions: {
		id: Col<"int8">;
		user_id: Col<"text">;
		plan_name: Col<"text">;
		ended_at: Col<"timestamptz", { nullable: true }>;
	};
}

interface TypeMap extends Omit<PgTypeMap, "int8"> {
	int8: number;
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

export const client = new pg.Client({
	connectionString: process.env.DATABASE_URL,
});

export const sql = createTransactionalSql<Postgres, DB, TypeMap, pg.Client>(
	postgres,
	client,
	{
		executor,
		transaction: (tx, depth, fn) =>
			runTransaction(
				(statement) => tx.query(statement),
				() => fn(tx),
				depth > 0 ? { savepoint: `sp${depth}` } : {},
			),
	},
)
	.withPlugin(new CasePlugin())
	.withPlugin(new FrozenRows());
