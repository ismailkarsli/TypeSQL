import { describe, expect, test } from "vitest";
import { getTableConfig, timestamp } from "drizzle-orm/pg-core";
import { createSql, pgType } from "../src/index.js";
import * as schema from "./fixtures/schema.js";

describe("createSql", () => {
  const sql = createSql<typeof schema>();

  test("builds { text, values }", () => {
    const q = sql("SELECT id, email FROM users WHERE mood = $1 AND id > $2", "happy", 1);
    expect(q.text).toBe("SELECT id, email FROM users WHERE mood = $1 AND id > $2");
    expect(q.values).toEqual(["happy", 1]);
  });

  test("named parameters and fragments work as in core", () => {
    const where = sql.fragment("WHERE a.user_id = :id", { id: 7 });
    const q = sql("SELECT a.id FROM auth.accounts a {where} LIMIT $1", { where }, 10);
    expect(q.text).toBe("SELECT a.id FROM auth.accounts a WHERE a.user_id = $2 LIMIT $1");
    expect(q.values).toEqual([10, 7]);
  });
});

describe("pgType", () => {
  test("returns the builder unchanged", () => {
    const builder = timestamp("at", { withTimezone: true });
    expect(pgType(builder, "timestamptz")).toBe(builder);
  });

  test("the fixture schema is valid Drizzle", () => {
    const users = getTableConfig(schema.users);
    expect(users.name).toBe("users");
    expect(users.columns.find((c) => c.name === "created_at")?.getSQLType()).toBe("timestamp with time zone");
    expect(getTableConfig(schema.accounts).schema).toBe("auth");
  });
});
