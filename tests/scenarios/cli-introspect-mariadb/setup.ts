import { createConnection } from "mysql2/promise";

const db = await createConnection({
	uri: process.env.DATABASE_URL!,
	multipleStatements: true,
});
await db.query(`CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL COMMENT 'Login name',
    role ENUM('admin', 'member') NOT NULL DEFAULT 'member',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    bio TEXT,
    meta JSON,
    slug VARCHAR(255) GENERATED ALWAYS AS (LOWER(email)) STORED,
    legacy_id INT INVISIBLE
  );
  CREATE VIEW active_users AS SELECT id, email FROM users WHERE bio IS NOT NULL;
  INSERT INTO users (email, bio, created_at) VALUES ('ada@example.com', NULL, '2024-01-02 03:04:05'), ('grace@example.com', 'Compiler', '2024-01-02 03:04:06');`);
await db.end();
