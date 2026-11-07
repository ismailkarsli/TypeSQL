import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	user: { id: Col<"int4">; email: Col<"text"> };
	user_subscription: { user_id: Col<"int4">; plan_key: Col<"text"> };
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(`
	CREATE TABLE "user" (id int4 PRIMARY KEY, email text NOT NULL);
	CREATE TABLE user_subscription (user_id int4 NOT NULL, plan_key text NOT NULL);
	INSERT INTO "user" VALUES (1, 'b@example.com'), (2, 'a@example.com'), (3, 'c@example.com');
	INSERT INTO user_subscription VALUES (1, 'pro'), (3, 'free');
`);
const sql = createSql<DB>(pool);
const plan = "pro";

// The whitespace at a fragment's edges separates it from the fragment before it.
export const ordered = await sql(
	`select * from "user" order by "email" ${sql.fragment(`asc`)}${sql.fragment(`
    limit 2
`)}`,
).execute();

// A fragment in a hole breaks over lines where it ends up, if it doesn't fit there.
export const subscribed = await sql(
	`select "id" from "user" where ${sql.fragment(`
    exists (
        select "user_subscription"."user_id"
        from "user_subscription"
        where "user_subscription"."user_id" = "user"."id"
            and "user_subscription"."plan_key" = ${sql.param(plan)}
    )
`)}`,
).execute();

// So does one on its own, and one without whitespace at its edges stays without.
const subscriber = sql.fragment(
	"exists (select 1 from user_subscription s where s.user_id = \"user\".id and s.plan_key <> 'free' and s.user_id > 0)",
);
export const paying = await sql(
	`select id from "user" where ${subscriber}`,
).execute();

console.log({ ordered, subscribed, paying });
await pool.end();
