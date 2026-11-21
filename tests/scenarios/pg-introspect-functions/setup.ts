import { Pool } from "pg";

const db = new Pool({ connectionString: process.env.DATABASE_URL });
await db.query(`
CREATE EXTENSION citext;
CREATE TABLE users (id serial PRIMARY KEY, name text NOT NULL, bio text);
INSERT INTO users (name, bio) VALUES ('Ada', NULL), ('Grace', 'Compiler');

CREATE FUNCTION slugify(text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT lower(replace($1, ' ', '-')) $$;
COMMENT ON FUNCTION slugify(text) IS 'A URL-safe name.';
CREATE FUNCTION greet(name text, greeting text DEFAULT 'Hello') RETURNS text
  LANGUAGE sql AS $$ SELECT greeting || ', ' || name $$;
CREATE FUNCTION total(VARIADIC xs int4[]) RETURNS int8
  LANGUAGE sql STRICT AS $$ SELECT sum(x) FROM unnest(xs) AS x $$;
CREATE FUNCTION pick(int4) RETURNS int4 LANGUAGE sql STRICT AS $$ SELECT $1 $$;
CREATE FUNCTION pick(text, text) RETURNS text LANGUAGE sql STRICT AS $$ SELECT $2 $$;
CREATE FUNCTION first_of(anyarray) RETURNS anyelement
  LANGUAGE sql STRICT AS $$ SELECT $1[1] $$;
CREATE FUNCTION user_by_id(int4) RETURNS users
  LANGUAGE sql STRICT AS $$ SELECT * FROM users WHERE id = $1 $$;
CREATE FUNCTION users_named(text) RETURNS SETOF users
  LANGUAGE sql STRICT AS $$ SELECT * FROM users WHERE name = $1 $$;
CREATE FUNCTION user_cards() RETURNS TABLE (id int4, label text)
  LANGUAGE sql AS $$ SELECT id, name FROM users $$;
CREATE AGGREGATE text_concat(text) (SFUNC = textcat, STYPE = text);
CREATE SCHEMA app;
CREATE FUNCTION app.version() RETURNS text LANGUAGE sql AS $$ SELECT '1.0' $$;
CREATE FUNCTION touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE PROCEDURE noop() LANGUAGE sql AS $$ SELECT 1 $$;
`);
await db.end();
