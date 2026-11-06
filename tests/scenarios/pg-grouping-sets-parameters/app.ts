import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	sales: {
		region: Col<"text">;
		amount: Col<"int4">;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);
await pool.query(
	"CREATE TABLE sales (region text NOT NULL, amount integer NOT NULL)",
);

// Over no rows the grand-total row of ROLLUP has a NULL sum, so the parameter
// added to it accepts null like the sum does.
const rollup = sql.prepare(
	"SELECT region, max(amount) + $1 AS top FROM sales GROUP BY ROLLUP (region)",
);
export type RollupParams = Parameters<typeof rollup>;
export const rolledUp = await rollup(null).execute();

// With a plain GROUP BY each group has a row, so max(amount) is not NULL.
const grouped = sql.prepare(
	"SELECT region, max(amount) + $1 AS top FROM sales GROUP BY region",
);
export type GroupedParams = Parameters<typeof grouped>;
export const groups = await grouped(1).execute();
console.dir({ rolledUp, groups }, { depth: null });
await pool.end();
