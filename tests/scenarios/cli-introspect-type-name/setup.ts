import { DatabaseSync } from "node:sqlite";

// --type-name names the schema interface, so it must be an identifier.
const db = new DatabaseSync(String(process.env.SQLITE_PATH));
db.exec("CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL)");
db.close();
