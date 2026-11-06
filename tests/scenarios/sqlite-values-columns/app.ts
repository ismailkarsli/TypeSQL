import { createSql } from "@typesql/core";
import { type Col, sqlite } from "@typesql/core/sqlite";

interface DB {
	users: {
		id: Col<"integer">;
		name: Col<"text", { hasDefault: true }>;
		bio: Col<"text", { nullable: true }>;
	};
}
const sql = createSql<DB>(sqlite);
declare const bio: string | undefined;
declare const rows: { id: number; name?: string }[];

// SQLite has no DEFAULT in a VALUES row, so every row gives the same columns.
sql(
	`INSERT INTO users ${sql.values("users", [
		{ id: 1, name: "a" },
		{ id: 2, name: "b" },
	])}`,
);
sql(`INSERT INTO users ${sql.values("users", [{ id: 1, bio }])}`);
sql(
	`INSERT INTO users ${sql.values("users", [
		{ id: 1, bio: undefined },
		{ id: 2, bio: undefined },
	])}`,
);
sql(
	`INSERT INTO users ${sql.values("users", [{ id: 1, name: "a" }, { id: 2 }])}`,
);
sql(
	`INSERT INTO users ${sql.values([
		{ id: 1, bio },
		{ id: 2, bio: "b" },
	])}`,
);
sql(`INSERT INTO users ${sql.values("users", rows)}`);
