import { DatabaseSync } from "node:sqlite";
import { CasePlugin } from "@typesql/core/plugins";
import type { Col, Json } from "@typesql/core/sqlite";
import { createSql } from "@typesql/sqlite";

interface DB {
	posts: {
		id: Col<"integer">;
		page_meta: Json<{ view_count: number }, { nullable: true }>;
		cafÉName: Col<"text", { nullable: true }>;
	};
}
const db = new DatabaseSync(process.env.SQLITE_PATH ?? ":memory:");
db.exec(`CREATE TABLE posts (
	id INTEGER PRIMARY KEY,
	page_meta JSON,
	"cafÉName" TEXT
)`);
const sql = createSql<DB>(db);

// SQLite returns JSON as text, which stays text; what is written still converts.
const camel = sql.withPlugin(new CasePlugin({ nested: "all" }));
await camel(
	`INSERT INTO posts ${camel.values("posts", [
		{ id: 1, pageMeta: camel.json({ viewCount: 1 }) },
		{ id: 2, pageMeta: camel.json(null) },
	])}`,
).execute();
export const text = await camel(
	"SELECT id, page_meta, page_meta ->> '$.view_count' AS view_count FROM posts ORDER BY id",
).execute();

// A capital outside ASCII is one to the type and at runtime alike.
const snake = sql.withPlugin(new CasePlugin({ to: "snake_case" }));
await snake(`UPDATE posts SET "cafÉName" = 'Ada'`).execute();
export const accented = await snake(
	`SELECT "cafÉName" FROM posts WHERE id = 1`,
).executeTakeFirstOrThrow();

console.log({ text, accented });
db.close();
