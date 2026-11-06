import { DatabaseSync } from "node:sqlite";
import type { Col } from "@typesql/core/sqlite";
import { createSql } from "@typesql/sqlite";

interface DB {
	users: {
		id: Col<"integer">;
		name: Col<"text">;
		bio: Col<"text", { nullable: true }>;
	};
	posts: {
		id: Col<"integer">;
		author_id: Col<"integer">;
		title: Col<"text">;
		body: Col<"text", { nullable: true }>;
	};
}

const db = new DatabaseSync(process.env.SQLITE_PATH ?? ":memory:");
db.exec(`CREATE TABLE users (id integer NOT NULL, name text NOT NULL, bio text);
	CREATE TABLE posts (id integer NOT NULL, author_id integer NOT NULL, title text NOT NULL, body text);
	INSERT INTO users VALUES (1, 'Ada', NULL), (2, 'Grace', 'SQL'), (3, 'Lin', 'Lisp');
	INSERT INTO posts VALUES (1, 1, 'SQL', NULL)`);
const sql = createSql<DB>(db);
export const notIn = await sql(
	"SELECT id, bio FROM users WHERE bio NOT IN (SELECT title FROM posts WHERE id > 1) ORDER BY id",
).execute();
export const notInEmpty = await sql(
	"SELECT id, bio FROM users WHERE bio NOT IN () ORDER BY id",
).execute();
export const notInList = await sql(
	"SELECT id, bio FROM users WHERE bio NOT IN ('SQL') ORDER BY id",
).execute();
export const joined = await sql(`
	SELECT u.name, p.id, p.title, p.body FROM users u
	LEFT JOIN posts p ON p.author_id = u.id ORDER BY u.id
`).execute();
export const matched = await sql(`
	SELECT u.name, p.id, p.title, p.body FROM users u
	LEFT JOIN posts p ON p.author_id = u.id WHERE p.title = 'SQL' ORDER BY u.id
`).execute();
export const right = await sql(`
	SELECT u.id, u.name, p.title FROM posts p
	RIGHT JOIN users u ON p.author_id = u.id WHERE p.id IS NOT NULL
`).execute();
console.dir(
	{ notIn, notInEmpty, notInList, joined, matched, right },
	{ depth: null },
);
db.close();
