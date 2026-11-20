import { Pool } from "pg";

const db = new Pool({ connectionString: process.env.DATABASE_URL });
await db.query(`
CREATE TABLE authors (id int PRIMARY KEY, name text NOT NULL, bio text);
CREATE TABLE posts (
  id int PRIMARY KEY,
  author_id int NOT NULL REFERENCES authors,
  title text NOT NULL,
  body jsonb NOT NULL
);
INSERT INTO authors VALUES (1, 'Ada', NULL), (2, 'Grace', 'Admiral');
INSERT INTO posts VALUES (1, 2, 'Compilers', '{"lede": "Bugs", "tags": ["cobol"]}');

CREATE VIEW author_posts AS
  SELECT a.id, a.name, a.bio, p.title FROM authors a LEFT JOIN posts p ON p.author_id = a.id;
CREATE VIEW post_counts AS
  SELECT author_id, count(*) AS posts, max(title) AS last_title FROM posts GROUP BY ROLLUP (author_id);
CREATE VIEW author_labels AS
  SELECT id, 1 AS one, row_number() OVER (ORDER BY id) AS n,
         coalesce(bio, name) AS label,
         CASE WHEN id > 1 THEN name ELSE 'first' END AS kind,
         CASE WHEN id > 1 THEN bio ELSE 'first' END AS note,
         id * 2 AS twice, name || '!' AS shout, id::text AS id_text
    FROM authors;
CREATE VIEW post_bodies AS
  SELECT id, body -> 'tags' AS tags, body ->> 'lede' AS lede FROM posts;
`);
await db.end();
