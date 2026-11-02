import { Pool } from "pg";
import { createSql } from "@typesql/pg";
import type { Col } from "@typesql/core/postgres";
interface DB {
	users: {
		id: Col<"int4">;
		display_name: Col<"text", { nullable: true }>;
		balance: Col<"int4">;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);
await pool.query(`CREATE TABLE users (id int PRIMARY KEY, display_name text, balance int NOT NULL);
  INSERT INTO users VALUES (1, 'Ada', 100), (2, NULL, 50)`);
import { CasePlugin } from "@typesql/core";
const camel = sql.withPlugin(new CasePlugin());
export const inserted = await camel(
	`INSERT INTO users ${camel.values("users", [{ id: 3, displayName: "Lin", balance: 0 }])} RETURNING id, display_name`,
).execute();
export const updated = await camel(
	`UPDATE users SET ${camel.set("users", { displayName: "Grace" })} WHERE id = $1 RETURNING id, display_name`,
	2,
).executeTakeFirstOrThrow();
export const deleted = await sql(
	"DELETE FROM users WHERE id = $1",
	3,
).executeCount();
console.log({ inserted, updated, deleted });
await pool.end();
