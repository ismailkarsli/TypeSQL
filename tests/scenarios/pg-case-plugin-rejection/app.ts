import { CasePlugin } from "@typesql/core/plugins";
import type { Col, Json } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	users: {
		display_name: Col<"text", { nullable: true }>;
		profile: Json<{ home_city: string }, { nullable: true }>;
	};
	accounts: {
		displayName: Col<"text", { nullable: true }>;
		settingsDoc: Json<{ maxRetries: number }, { nullable: true }>;
	};
}
const sql = createSql<DB>(new Pool());

// Without nested, JSON keeps the names of the database.
const flat = sql.withPlugin(new CasePlugin());
flat(`UPDATE users SET profile=${flat.json({ homeCity: "Oslo" })}`);
const flatRow = await flat(
	"SELECT profile FROM users",
).executeTakeFirstOrThrow();
flatRow.profile?.homeCity;

// With it, the values are still checked against the column's shape.
const nested = sql.withPlugin(new CasePlugin({ nested: true }));
nested(`UPDATE users SET profile=${nested.json({ homeCity: 1 })}`);
nested(`UPDATE users SET profile=${nested.json({ otherKey: "Oslo" })}`);
nested(`UPDATE users SET ${nested.set("users", { profile: { homeCity: 1 } })}`);
const nestedRow = await nested(
	"SELECT profile FROM users",
).executeTakeFirstOrThrow();
nestedRow.profile?.home_city;

// to: "snake_case" takes snake_case keys and returns them.
const snake = sql.withPlugin(new CasePlugin({ to: "snake_case" }));
snake(`UPDATE accounts SET ${snake.set("accounts", { displayName: "Ada" })}`);
const snakeRow = await snake(
	`SELECT "displayName" FROM accounts`,
).executeTakeFirstOrThrow();
snakeRow.displayName;
