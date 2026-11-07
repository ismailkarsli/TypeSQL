import { CasePlugin } from "@typesql/core/plugins";
import type { Col, Json } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface Holdings {
	[symbol: string]: string | number;
}
interface DB {
	docs: {
		id: Col<"int4">;
		holdings: Json<Holdings, { nullable: true }>;
		profile: Json<{ home_city: string }, { nullable: true }>;
		extra: Json<
			{ last_seen: string; past_cities: readonly { city_name: string }[] },
			{ hasDefault: true }
		>;
	};
	accounts: {
		id: Col<"int4">;
		settingsDoc: Json<{ maxRetries: number }, { nullable: true }>;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(`CREATE TABLE docs (id int PRIMARY KEY, holdings jsonb, profile jsonb, extra jsonb NOT NULL DEFAULT '{"last_seen":"never","past_cities":[]}');
CREATE TABLE accounts (id int PRIMARY KEY, "settingsDoc" jsonb)`);
const sql = createSql<DB>(pool);
const stored = (id: number) =>
	sql(
		`SELECT holdings, profile, extra FROM docs WHERE id = ${sql.param(id)}`,
	).executeTakeFirstOrThrow();

const holdings = { SASA: 1, "SISE.IS": 2, startDate: "x" };

// "output": rows are renamed, and whatever is written stays as written.
const output = sql.withPlugin(new CasePlugin({ nested: "output" }));
await output(
	`INSERT INTO docs ${output.values("docs", [
		{
			id: 1,
			holdings: output.json(holdings),
			profile: { home_city: "Oslo" },
			extra: output.json({
				last_seen: "today",
				past_cities: [{ city_name: "Rome" }],
			}),
		},
	])}`,
).execute();
await output(
	`INSERT INTO docs (id, holdings, profile) VALUES (2, ${output.param(holdings)}, ${output.json(null)})`,
).execute();
await output(
	`INSERT INTO docs (id) VALUES (3) ON CONFLICT DO NOTHING`,
).execute();
await output(
	`UPDATE docs SET ${output.set("docs", { holdings, profile: { home_city: "Lima" } })} WHERE id = 3`,
).execute();
export const outputRead = await output(
	"SELECT id, holdings, profile, extra FROM docs ORDER BY id",
).execute();
export const outputStored = [await stored(1), await stored(2), await stored(3)];

// "input": what is written is renamed, and rows keep the database's keys.
const input = sql.withPlugin(new CasePlugin({ nested: "input" }));
await input(
	`INSERT INTO docs ${input.values("docs", [
		{
			id: 4,
			profile: input.json({ homeCity: "Oslo" }),
			extra: {
				lastSeen: "today",
				pastCities: [{ cityName: "Rome" }],
			},
		},
	])}`,
).execute();
export const inputRead = await input(
	"SELECT id, profile, extra FROM docs WHERE id = 4",
).executeTakeFirstOrThrow();
export const inputStored = await stored(4);

// "all": both.
const all = sql.withPlugin(new CasePlugin({ nested: "all" }));
await all(
	`INSERT INTO docs (id, profile) VALUES (5, ${all.param({ homeCity: "Oslo" })})`,
).execute();
export const allRead = await all(
	"SELECT id, profile FROM docs WHERE id = 5",
).executeTakeFirstOrThrow();
export const allStored = await stored(5);

// Left out, or false, keys inside values stay as they are both ways.
const flat = sql.withPlugin(new CasePlugin({ nested: false }));
await flat(
	`INSERT INTO docs (id, profile) VALUES (6, ${flat.json({ home_city: "Oslo" })})`,
).execute();
export const flatRead = await flat(
	"SELECT id, profile FROM docs WHERE id = 6",
).executeTakeFirstOrThrow();

// The modes work the same way round with to: "snake_case".
const snake = sql.withPlugin(
	new CasePlugin({ to: "snake_case", nested: "output" }),
);
await snake(
	`INSERT INTO accounts (id, "settingsDoc") VALUES (1, ${snake.json({ maxRetries: 1 })})`,
).execute();
export const snakeRead = await snake(
	`SELECT "settingsDoc" FROM accounts`,
).executeTakeFirstOrThrow();

// Plugin options arrive from untyped code too.
try {
	new CasePlugin({ nested: JSON.parse("true") });
} catch (error) {
	console.log(error instanceof Error ? error.message : error);
}

console.dir(
	{
		outputRead,
		outputStored,
		inputRead,
		inputStored,
		allRead,
		allStored,
		flatRead,
		snakeRead,
	},
	{ depth: null },
);
await pool.end();
