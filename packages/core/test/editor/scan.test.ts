import { expect, test } from "vitest";
import { contextAt, type ScopeItem } from "../../src/editor/scan.js";

/** The context at `|`, written short: `none`, `relation [schema]`, `columns <sources> [| aliases]`. */
function at(marked: string): string {
  const offset = marked.indexOf("|");
  const text = marked.slice(0, offset) + marked.slice(offset + 1);
  const { expect: e, from } = contextAt(text, offset);
  const word = text.slice(from, offset);
  const typed = word ? ` (${word})` : "";
  if (e.kind === "none") return "none";
  if (e.kind === "relation") return `relation${e.schema === null ? "" : ` ${e.schema}`}${e.ctes.length ? ` +${e.ctes.map((c) => c.name).join(",")}` : ""}${typed}`;
  const src = (s: ScopeItem): string =>
    s.rel ? `${s.rel.schema === null ? "" : `${s.rel.schema}.`}${s.rel.name}${s.name === s.rel.name ? "" : ` ${s.name}`}` : `${s.name || "?"}(${s.columns?.join(",") ?? "?"})`;
  return `columns ${e.sources.map(src).join(", ")}${e.aliases.length ? ` | ${e.aliases.join(", ")}` : ""}${typed}`;
}

const cases: [string, string][] = [
  // relations
  ["SELECT * FROM |", "relation"],
  ["SELECT * FROM us|", "relation (us)"],
  ["select * from |", "relation"],
  ["SELECT * FROM | WHERE id = 1", "relation"],
  ["SELECT * FROM users u JOIN |", "relation"],
  ["SELECT * FROM users u LEFT OUTER JOIN | ON true", "relation"],
  ["SELECT * FROM users, |", "relation"],
  ["SELECT * FROM users u, po|", "relation (po)"],
  ["SELECT * FROM auth.|", "relation auth"],
  ["SELECT * FROM auth.se|", "relation auth (se)"],
  ["SELECT * FROM users u JOIN auth.| s ON true", "relation auth"],
  ["INSERT INTO |", "relation"],
  ["UPDATE |", "relation"],
  ["DELETE FROM |", "relation"],
  ["DELETE FROM users USING |", "relation"],
  ["MERGE INTO users u USING |", "relation"],
  ["TABLE |", "relation"],
  ["SELECT * FROM ONLY |", "relation"],
  ["SELECT * FROM users u, LATERAL |", "relation"],
  ["WITH recent AS (SELECT id FROM posts) SELECT * FROM |", "relation +recent"],
  ["SELECT * FROM users WHERE id IN (SELECT author_id FROM |)", "relation"],

  // columns after alias. / table.
  ["SELECT u.| FROM users u", "columns users u"],
  ["SELECT u.em| FROM users u", "columns users u (em)"],
  ["SELECT U.| FROM users u", "columns users u"],
  ["SELECT p.| FROM users u JOIN posts AS p ON p.author_id = u.id", "columns posts p"],
  ["SELECT * FROM users u JOIN posts p ON p.| = u.id", "columns posts p"],
  ["SELECT users.| FROM users", "columns users"],
  ["SELECT users.| FROM posts", "columns users"],
  ["SELECT s.| FROM auth.sessions s", "columns auth.sessions s"],
  ["SELECT auth.sessions.| FROM auth.sessions", "columns auth.sessions"],
  ['SELECT "U".| FROM users "U"', "columns users U"],
  ["SELECT x.| FROM (SELECT id, email AS mail, count(*) FROM users GROUP BY id) x", "columns x(id,mail,count)"],
  ["SELECT x.| FROM (SELECT id FROM users) AS x(user_id)", "columns x(user_id)"],
  ["WITH r AS (SELECT id, title FROM posts) SELECT r.| FROM r", "columns r(id,title)"],
  ["WITH r(a, b) AS (SELECT id, title FROM posts) SELECT r.| FROM r", "columns r(a,b)"],
  ["SELECT g.| FROM generate_series(1, 3) AS g(n)", "columns g(n)"],
  // the inner alias shadows the outer one
  ["SELECT * FROM users u WHERE EXISTS (SELECT 1 FROM posts u WHERE u.|)", "columns posts u"],
  // an outer alias inside a subquery
  ["SELECT * FROM users u WHERE EXISTS (SELECT 1 FROM posts p WHERE p.author_id = u.|)", "columns users u"],

  // bare columns
  ["SELECT | FROM users", "columns users | users"],
  ["SELECT id, | FROM users u", "columns users u | u"],
  ["SELECT * FROM users WHERE |", "columns users | users"],
  ["SELECT * FROM users WHERE id = 1 AND |", "columns users | users"],
  ["SELECT * FROM users u JOIN posts p ON |", "columns users u, posts p | u, p"],
  ["SELECT * FROM users WHERE id = |", "columns users | users"],
  ["SELECT * FROM users ORDER BY |", "columns users | users"],
  ["SELECT * FROM users GROUP BY id, |", "columns users | users"],
  ["SELECT count(|) FROM users", "columns users | users"],
  ["SELECT * FROM users WHERE id IN (|)", "columns users | users"],
  ["SELECT a * | FROM users", "columns users | users"],
  ["SELECT * FROM users u JOIN posts p USING (|)", "columns users u, posts p | u, p"],
  // correlated: outer items follow the inner ones
  ["SELECT * FROM users u WHERE EXISTS (SELECT 1 FROM posts p WHERE |)", "columns posts p, users u | p, u"],
  // UNION branches have their own FROM items
  ["SELECT id FROM users UNION SELECT | FROM posts", "columns posts | posts"],

  // DML targets
  ["INSERT INTO users (|", "columns users"],
  ["INSERT INTO users (id, |) VALUES (1, 2)", "columns users"],
  ["INSERT INTO users AS u (|", "columns users u"],
  ["UPDATE users SET |", "columns users"],
  ["UPDATE users SET name = 'x', |", "columns users"],
  ["UPDATE users u SET name = | FROM posts p", "columns users u, posts p | u, p"],
  ["UPDATE users SET name = 'x' WHERE |", "columns users | users"],
  ["DELETE FROM users WHERE |", "columns users | users"],
  ["DELETE FROM users u RETURNING u.|", "columns users u"],
  ["INSERT INTO users (id) VALUES (1) ON CONFLICT (|", "columns users"],
  ["INSERT INTO users (id) VALUES (1) ON CONFLICT (id) DO UPDATE SET |", "columns users"],
  ["INSERT INTO users (id) VALUES (1) ON CONFLICT (id) DO UPDATE SET name = excluded.|", "columns users excluded"],
  ["MERGE INTO users u USING posts p ON p.author_id = u.id WHEN NOT MATCHED THEN INSERT (|", "columns users u"],
  ["MERGE INTO users u USING posts p ON p.author_id = u.id WHEN MATCHED THEN UPDATE SET |", "columns users u"],

  // nothing
  ["|", "none"],
  ["SEL|", "none"],
  ["SELECT * FROM users |", "none"],
  ["SELECT * FROM users u |", "none"],
  ["SELECT * |", "none"],
  ["SELECT *|", "none"],
  ["SELECT * FROM users WHERE name = 'a|", "none"],
  ["SELECT * FROM users WHERE name = 'a, b' AND |", "columns users | users"],
  ["SELECT * FROM users -- a |", "none"],
  ["SELECT * FROM users /* FROM | */", "none"],
  ['SELECT "us| FROM users', "none"],
  ["SELECT $$ FROM |$$", "none"],
  ["SELECT * FROM users WHERE id = $1|", "none"],
  ["SELECT * FROM users WHERE id = :id|", "none"],
  ["SELECT id::|", "none"],
  ["INSERT INTO users VALUES (|", "none"],
  ["SELECT * FROM users {wh|ere}", "none"],
  ["SELECT 1.|", "none"],
];

test.each(cases)("%s", (marked, want) => {
  expect(at(marked)).toBe(want);
});

test("comments, strings and placeholders between the keyword and the cursor", () => {
  expect(at("SELECT * FROM /* x */ |")).toBe("relation");
  expect(at("SELECT * FROM users -- note\n WHERE |")).toBe("columns users | users");
  expect(at("SELECT * FROM users WHERE id = $0          AND |")).toBe("columns users | users");
  expect(at("SELECT * FROM users {where} AND |")).toBe("columns users | users");
});

test("several lines", () => {
  expect(at("SELECT u.id,\n       u.|\n  FROM users u\n  JOIN posts p ON p.author_id = u.id")).toBe("columns users u");
});
