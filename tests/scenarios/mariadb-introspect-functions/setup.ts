import { createConnection } from "mysql2/promise";

const db = await createConnection({
	uri: process.env.DATABASE_URL!,
	multipleStatements: true,
});
await db.query(`CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL
  );
  INSERT INTO users (email) VALUES ('Ada@Example.com');
  CREATE FUNCTION slugify(s VARCHAR(255)) RETURNS VARCHAR(255) DETERMINISTIC
    COMMENT 'A URL-safe name.'
    RETURN LOWER(REPLACE(s, ' ', '-'));
  CREATE FUNCTION add_tax(price DECIMAL(10,2), rate DOUBLE) RETURNS DECIMAL(10,2) DETERMINISTIC
    RETURN price * (1 + rate);
  CREATE FUNCTION next_id(id INT UNSIGNED) RETURNS BIGINT UNSIGNED DETERMINISTIC
    RETURN id + 1;
  CREATE PROCEDURE noop() SELECT 1;`);
await db.end();
