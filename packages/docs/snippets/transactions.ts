import { check, type Equal } from "./_check.js";
import type { DB } from "./schema.js";

// #region basic
import { Pool } from "pg";
import { createSql } from "@typesql/pg";

const sql = createSql<DB>(new Pool());

const userId = await sql.transaction(async (tx) => {
	const { id } = await tx(
		"INSERT INTO users (email) VALUES ($1) RETURNING id",
		"ada@example.com",
	).executeTakeFirstOrThrow();
	await tx(
		"INSERT INTO posts (author_id, title) VALUES ($1, $2)",
		id,
		"Hello",
	).execute();
	return id; // the transaction resolves to what fn returns
});
// userId: number
// #endregion basic
check<Equal<typeof userId, number>>();

// #region sequential
await sql.transaction(async (tx) => {
	// one connection: run statements one after another
	await tx(
		"UPDATE users SET display_name = $1 WHERE id = $2",
		"Ada",
		1,
	).execute();
	await tx(
		"UPDATE users SET display_name = $1 WHERE id = $2",
		"Grace",
		2,
	).execute();
	// not: await Promise.all([tx(…).execute(), tx(…).execute()])
});
// #endregion sequential
