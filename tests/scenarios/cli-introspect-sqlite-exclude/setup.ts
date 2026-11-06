import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.SQLITE_PATH!);
db.exec(`CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL);
CREATE TABLE drafts (id integer PRIMARY KEY);
CREATE TABLE logs_2026 (id integer PRIMARY KEY);`);
db.close();
