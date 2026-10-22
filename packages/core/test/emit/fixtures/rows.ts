/**
 * Declaration-emit fixture (`declaration-emit.test.ts`): exported values whose inferred types
 * hold rows. Rows must be plain object types, so a package that re-exports them does not need
 * to name a TypeSQL type (TS2883 "cannot be named without a reference to …").
 */
import { createSql, type Col, type Enum, type Generated, type Nullable } from "../../../src/index.js";

interface DB {
  users: {
    id: Generated<"int4">;
    email: Col<"text">;
    mood: Enum<"mood">;
    avatar: Nullable<"bytea">;
    session_length: Nullable<"interval">;
    location: Nullable<"point">;
    meta: Nullable<"jsonb">;
    created_at: Generated<"timestamptz">;
  };
  $types: { mood: "happy" | "sad" };
}
const sql = createSql<DB>(async () => []);

export const rows = async () => sql("SELECT * FROM users").execute();
export const first = async (id: number) => sql("SELECT id, email, mood FROM users WHERE id = $1", id).executeTakeFirst();
export const counts = async () => sql("SELECT mood, count(*) AS n, max(created_at) AS latest FROM users GROUP BY mood").execute();

const camel = createSql<DB>(async () => [], { rowKeys: "camelCase" });
export const camelRows = async () => camel("SELECT id, created_at, session_length FROM users").execute();
