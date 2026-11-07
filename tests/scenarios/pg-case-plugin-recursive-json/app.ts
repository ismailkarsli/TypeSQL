import { CasePlugin } from "@typesql/core/plugins";
import type { Col, Json } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

type JSONType =
	| string
	| number
	| boolean
	| null
	| JSONType[]
	| { [key: string]: JSONType };
// Recursive, but not every JSON value fits it: its keys are still renamed.
type Expr = string | Expr[] | { op_name: string; arg_list: Expr[] };
interface DB {
	docs: {
		id: Col<"int4">;
		data: Json<JSONType>;
		optional_data: Json<JSONType, { nullable: true }>;
		expr: Json<Expr, { nullable: true }>;
	};
	rebalance: {
		id: Col<"int4">;
		periodic_value: Col<"int4">;
		outperform_symbols: Json<string[]>;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(`CREATE TABLE docs (id int PRIMARY KEY, data jsonb NOT NULL, optional_data jsonb, expr jsonb);
CREATE TABLE rebalance (id int PRIMARY KEY, periodic_value int NOT NULL, outperform_symbols jsonb NOT NULL);
INSERT INTO rebalance VALUES (1, 30, '["XU100"]')`);

const value: JSONType = { someKey: [{ innerKey: 1 }, "text", null] };
const nested = createSql<DB>(pool).withPlugin(
	new CasePlugin({ nested: "all" }),
);

// The value's type stays the recursive type, and types after it stay correct.
await nested(
	`INSERT INTO docs (id, data, optional_data, expr) VALUES (1, ${nested.json(value)}, ${nested.json(null)}, ${nested.json(
		{ opName: "add", argList: ["a", ["b"]] },
	)})`,
).execute();
const { data, optionalData, expr } = await nested(
	"SELECT data, optional_data, expr FROM docs",
).executeTakeFirstOrThrow();
const kept: JSONType = data;
const keptOptional: JSONType = optionalData;
const [row] = await nested(
	`SELECT to_json("rebalance") AS "rebalance", data FROM rebalance, docs`,
).execute();

// Each of these is `any` if the recursive type collapses.
export const stringData = typeof data === "string" ? data : "other";
export const nullableData = optionalData === null ? optionalData : "set";
export const opName =
	typeof expr === "object" && expr !== null && !Array.isArray(expr)
		? expr.opName
		: undefined;
export const rebalance = row?.rebalance;

const stored = await pool.query("SELECT data, expr FROM docs");
console.dir(
	{ kept, keptOptional, expr, opName, rebalance, stored: stored.rows },
	{ depth: null },
);
await pool.end();
