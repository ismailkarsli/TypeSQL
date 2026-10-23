import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { parseCache } from "../../src/cache/format.js";
import { generate } from "../../src/cache/job.js";
import { engineVersion } from "../../src/cache/mapper.js";
import { SCHEMA, tempProject, tsconfig, type TempProject } from "./project.js";

let p: TempProject;
const STATEMENTS = `import { migrations, type RowOf, type DefaultTypeMap } from "@typesql/core";
import { sql, type DB } from "./db.js";
export const a = sql("SELECT id, email FROM users WHERE id = $1", 1);
export const b = sql("SELECT title FROM posts WHERE author_id = :author", { author: 1 });
export const c = sql(\`SELECT u.name FROM users u WHERE u.id = \${sql.param(2)}\`);
export type R = RowOf<DB, DefaultTypeMap, "SELECT count(*) AS n FROM posts">;
export const m = migrations<DB>().add("CREATE TABLE tags (id int4 PRIMARY KEY)").add("ALTER TABLE tags ADD COLUMN label text");
`;
beforeAll(() => {
  p = tempProject({ "tsconfig.json": tsconfig(), "src/db.ts": SCHEMA, "src/statements.ts": STATEMENTS, "src/generated/queries.typesqlcache": "{}\n" });
});
afterAll(() => p.remove());

const pass = () =>
  generate({ configFile: join(p.dir, "tsconfig.json"), cacheFile: join(p.dir, "src/generated/queries.typesqlcache"), engine: engineVersion(), isCorePath: (f) => f.startsWith(join(p.corePackage, "dist")) });

test("a pass computes what changed and keeps the rest", async () => {
  const first = await pass();
  expect(first.statements).toBe(6);
  expect(first.computed).toBeGreaterThanOrEqual(9);
  expect(first.reused).toBe(0);
  expect(first.written).toBe(true);
  const file = parseCache(readFileSync(join(p.dir, "src/generated/queries.typesqlcache"), "utf8"))!;
  expect(Object.keys(file.ddl).sort()).toEqual(["ALTER TABLE tags ADD COLUMN label text", "CREATE TABLE tags (id int4 PRIMARY KEY)"]);

  // nothing changed: nothing computed, the file is not rewritten
  const second = await pass();
  expect(second.computed).toBe(0);
  expect(second.reused).toBe(first.computed);
  expect(second.written).toBe(false);

  // users changes: the statements over users are computed again, the others kept
  p.write("src/db.ts", SCHEMA.replace('email: Col<"text">', 'email: Nullable<"text">'));
  const third = await pass();
  expect(third.computed).toBeGreaterThan(0);
  expect(third.computed).toBeLessThan(first.computed);
  const after = parseCache(readFileSync(join(p.dir, "src/generated/queries.typesqlcache"), "utf8"))!;
  const entries = Object.values(after.groups).flatMap((g) => Object.entries(g.entries));
  const a = entries.find(([k]) => k === "SELECT id, email FROM users WHERE id = $1")![1];
  expect(a.c![0]!.q).toContain("email: string | null");
}, 120_000);
