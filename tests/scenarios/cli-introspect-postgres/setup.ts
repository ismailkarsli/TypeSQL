import { Pool } from "pg";
const db = new Pool({ connectionString: process.env.DATABASE_URL });
await db.query(
	"CREATE TABLE users (id serial PRIMARY KEY, name text NOT NULL, bio text); INSERT INTO users (name) VALUES ('Ada')",
);
await db.end();
