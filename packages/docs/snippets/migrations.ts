import { createSql, migrations, type ApplyDdl, type Col, type Generated, type RowType, type SchemaOf } from "@typesql/core";
import { check, type Equal } from "./_check.js";

// #region applyddl
interface Before {
  users: { id: Generated<"int4">; email: Col<"text"> };
}
type After = ApplyDdl<Before, "ALTER TABLE users ADD COLUMN age int NOT NULL DEFAULT 0; ALTER TABLE users RENAME COLUMN email TO login">;
// After["users"]: { id: Generated<"int4">; login: Col<"text">; age: Generated<"int4"> }
// #endregion applyddl
check<Equal<After["users"], { id: Generated<"int4">; login: Col<"text">; age: Generated<"int4"> }>>();

// #region builder
const m = migrations()
  .add(`CREATE TYPE mood AS ENUM ('happy', 'neutral', 'sad')`)
  .add(`CREATE TABLE users (
          id serial PRIMARY KEY,
          email text NOT NULL UNIQUE,
          display_name text,
          mood mood NOT NULL DEFAULT 'neutral'
        )`)
  .add(`CREATE VIEW named_users AS SELECT id, display_name FROM users WHERE display_name IS NOT NULL`);

type DB = SchemaOf<typeof m>;
const sql = createSql<DB>();
const q = sql("SELECT id, display_name, mood FROM users WHERE email = $1", "a@b.c");
// { id: number; display_name: string | null; mood: "happy" | "neutral" | "sad" }
// #endregion builder
check<Equal<RowType<typeof q>, { id: number; display_name: string | null; mood: "happy" | "neutral" | "sad" }>>();
// the view's WHERE clause narrows display_name to non-null
check<Equal<RowType<ReturnType<typeof sql<"SELECT id, display_name FROM named_users">>>, { id: number; display_name: string }>>();
