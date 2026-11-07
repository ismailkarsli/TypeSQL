import { CasePlugin } from "@typesql/core/plugins";
import type { Col, Json } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	users: {
		display_name: Col<"text", { nullable: true }>;
		point_x_y: Col<"int4", { nullable: true }>;
		profile: Json<{ home_city: string }, { nullable: true }>;
	};
	accounts: {
		displayName: Col<"text", { nullable: true }>;
		settingsDoc: Json<{ maxRetries: number }, { nullable: true }>;
	};
	acronyms: {
		userID: Col<"int4", { nullable: true }>;
		HTTPCode: Col<"int4", { nullable: true }>;
		Id2: Col<"int4", { nullable: true }>;
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
// `pointXY` would convert to point_xy, so point_x_y is written by its own name.
flat(`UPDATE users SET ${flat.set("users", { pointXY: 1 })}`);

// With it, the values are still checked against the column's shape.
const nested = sql.withPlugin(new CasePlugin({ nested: "all" }));
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

// The key a read returns isn't a write key when it doesn't convert back to the
// column: only the column's own name is.
const round = sql.withPlugin(new CasePlugin({ to: "snake_case" }));
round(`UPDATE acronyms SET ${round.set("acronyms", { user_id: 1 })}`);
round(`UPDATE acronyms SET ${round.set("acronyms", { http_code: 1 })}`);
round(`UPDATE acronyms SET ${round.set({ id2: 1 })}`);
round(`INSERT INTO acronyms ${round.values("acronyms", [{ user_id: 1 }])}`);

// "output" renames rows only and "input" what is written only.
const output = sql.withPlugin(new CasePlugin({ nested: "output" }));
output(`UPDATE users SET profile=${output.json({ homeCity: "Oslo" })}`);
output(
	`UPDATE users SET ${output.set("users", { profile: { homeCity: "Oslo" } })}`,
);
const outputRow = await output(
	"SELECT profile FROM users",
).executeTakeFirstOrThrow();
outputRow.profile?.home_city;
const input = sql.withPlugin(new CasePlugin({ nested: "input" }));
input(`UPDATE users SET profile=${input.json({ home_city: "Oslo" })}`);
const inputRow = await input(
	"SELECT profile FROM users",
).executeTakeFirstOrThrow();
inputRow.profile?.homeCity;

// nested takes a mode, not a boolean.
new CasePlugin({ nested: true });
