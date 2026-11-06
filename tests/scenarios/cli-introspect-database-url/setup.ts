import { createConnection } from "mysql2/promise";

const db = await createConnection(String(process.env.DATABASE_URL));
await db.query(
	"CREATE TABLE users (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, email VARCHAR(255) NOT NULL, bio TEXT)",
);
await db.query("INSERT INTO users (email) VALUES ('ada@example.com')");
await db.end();
