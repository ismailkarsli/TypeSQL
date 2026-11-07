import type { Col } from "@typesql/core/mysql";
import { createSql } from "@typesql/mysql";
import { createPool } from "mysql2/promise";

interface DB {
	users: {
		id: Col<"int">;
		name: Col<"varchar">;
		visits: Col<"int">;
	};
}
const pool = createPool({ uri: process.env.DATABASE_URL! });
await pool.query(
	"CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL, visits INT NOT NULL)",
);
// The dialect comes from the types: no config, and MySQL's rules apply.
const sql = createSql<DB>(pool);
await sql(
	"insert into users (id,name,visits) values (1,\"Ada\",1),(2,'Bob',1),(3,'Cy',1)",
).execute();
await sql(
	`insert into users (id, name, visits) values (1, "Ada", 1) as new # "…" is a string
	on duplicate key update visits=users.visits+new.visits`,
).execute();
// MySQL names an unaliased column after its text.
export const rows = await sql(
	"select id, visits+0, Visits, `name` as `Name` from users where visits div 1 >= 1",
).execute();
console.log(rows);
await pool.end();
