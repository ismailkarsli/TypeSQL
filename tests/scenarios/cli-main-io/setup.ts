import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.SQLITE_PATH!);
db.exec("CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL)");
db.close();
