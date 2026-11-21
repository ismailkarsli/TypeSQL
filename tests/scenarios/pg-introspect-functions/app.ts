import { createSql } from "@typesql/pg";
import { Pool } from "pg";

import type { DB } from "./schema.js";

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(db);

export const scalars = await sql(`
  SELECT slugify(name) AS slug, slugify(bio) AS bio_slug,
         greet(name) AS hello, greet(name, 'Hi') AS hi, greet(bio) AS bio_hello,
         total(1, 2, 3) AS total, pick(id) AS id, pick(name, 'x') AS picked,
         first_of(ARRAY[id]) AS first, app.version() AS version
  FROM users ORDER BY id`).exec();
export const found = await sql("SELECT * FROM user_by_id(1)").exec();
export const named = await sql(
	"SELECT id, name FROM users_named('Ada')",
).exec();
export const cards = await sql("SELECT * FROM user_cards() ORDER BY id").exec();
export const joined = await sql(
	"SELECT text_concat(name ORDER BY id) AS names FROM users",
).exec();
console.log({ scalars, found, named, cards, joined });
await db.end();
