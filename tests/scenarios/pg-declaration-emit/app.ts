import { client, sql } from "./sql.js";

export function activeSubscriptionQuery(userId: string) {
	return sql(
		`SELECT id, plan_name, ended_at FROM subscriptions WHERE user_id = ${sql.param(userId)} AND ended_at IS NULL`,
	);
}

await client.connect();
await client.query(`CREATE TABLE subscriptions (id int8 PRIMARY KEY, user_id text NOT NULL, plan_name text NOT NULL, ended_at timestamptz);
  INSERT INTO subscriptions VALUES (1, 'ada', 'pro', NULL), (2, 'ada', 'free', '2026-01-01T00:00:00Z');`);
export const active = await activeSubscriptionQuery("ada").execute();
console.log(active, Object.isFrozen(active[0]));
await client.end();
