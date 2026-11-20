import { createSql } from "@typesql/pg";
import { Pool } from "pg";

const db = new Pool({ connectionString: process.env.DATABASE_URL });

import type { DB } from "./schema.js";

const sql = createSql<DB>(db);
export const authorPosts = await sql(
	"SELECT id, name, bio, title FROM author_posts ORDER BY id",
).exec();
export const postCounts = await sql(
	"SELECT author_id, posts, last_title FROM post_counts ORDER BY author_id NULLS LAST",
).exec();
export const authorLabels = await sql(
	"SELECT id, one, n, label, kind, note, twice, shout, id_text FROM author_labels ORDER BY id",
).exec();
export const postBodies = await sql(
	"SELECT id, tags, lede FROM post_bodies ORDER BY id",
).exec();
console.log(authorPosts, postCounts, authorLabels, postBodies);
await db.end();
