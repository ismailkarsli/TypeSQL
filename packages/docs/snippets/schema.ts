import { createSql, type Col, type Enum, type Generated, type Nullable, type View } from "@typesql/core";

// #region schema
export interface DB {
  users: {
    id: Generated<"int4">; // serial / identity / DEFAULT: optional on INSERT
    email: Col<"text">; // NOT NULL
    display_name: Nullable<"text">; // NULL allowed
    mood: Enum<"mood", { hasDefault: true }>; // a CREATE TYPE … AS ENUM with a DEFAULT
    created_at: Generated<"timestamptz">;
  };
  posts: {
    id: Generated<"int8">;
    author_id: Col<"int4">;
    title: Col<"text">;
    body: Nullable<"text">;
    tags: Generated<"text[]">;
  };
  user_stats: View<{ user_id: Col<"int4">; posts: Col<"int8"> }>;
  $types: { mood: "happy" | "neutral" | "sad" };
}
// #endregion schema

// #region create
export const sql = createSql<DB>();
// #endregion create
