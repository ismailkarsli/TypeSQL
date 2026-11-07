import type { DatabaseSync } from "node:sqlite";
import type { Col } from "@typesql/core/sqlite";
import { createSql } from "@typesql/sqlite";

export interface DB {
	items: {
		id: Col<"integer">;
		price: Col<"integer">;
		qty: Col<"integer">;
	};
}

export const count = (db: DatabaseSync) =>
	createSql<DB>(db)(
		"select count(*) as n from items",
	).executeTakeFirstOrThrow();
