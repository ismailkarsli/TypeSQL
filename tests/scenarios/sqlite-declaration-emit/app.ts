import { db, sql } from "./sql.js";

export function activeSubscriptionQuery(userId: string) {
	return sql(
		`SELECT id, plan_name, ended_at FROM subscriptions WHERE user_id = ${sql.param(userId)} AND ended_at IS NULL`,
	);
}

db.exec(`CREATE TABLE subscriptions (id integer PRIMARY KEY, user_id text NOT NULL, plan_name text NOT NULL, ended_at text);
  INSERT INTO subscriptions VALUES (1, 'ada', 'pro', NULL), (2, 'ada', 'free', '2026-01-01');`);
export const active = await activeSubscriptionQuery("ada").execute();
console.log(active, Object.isFrozen(active[0]));
db.close();
