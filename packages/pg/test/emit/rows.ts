/**
 * Declaration-emit fixture (`declaration-emit.test.ts`): rows typed with `PgTypeMap` must be
 * plain object types, including `interval` (no `PgInterval` reference), so packages that
 * re-export them do not need `@typesql/pg` as a dependency (TS2883).
 */
import type { Col, Generated, Nullable } from "@typesql/core";
import { createSql } from "../../src/index.js";

interface DB {
  users: {
    id: Generated<"int4">;
    avatar: Nullable<"bytea">;
    session_length: Nullable<"interval">;
    location: Nullable<"point">;
  };
}
const sql = createSql<DB>();

export const rows = async () => sql("SELECT * FROM users").execute();
