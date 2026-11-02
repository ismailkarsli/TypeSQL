import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.env.SQLITE_PATH!);
db.exec(
	"CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL, bio text); INSERT INTO users VALUES (1, 'Ada', NULL)",
);
db.close();
