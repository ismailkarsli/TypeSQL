---
description: "Format the SQL inside TypeSQL calls with typesql format: one keyword case, tidy spacing and lines, found through TypeScript's types whatever the functions are named."
---

# Formatting SQL

`typesql format` formats the SQL that TypeSQL checks: it writes every keyword in one case, tidies the spaces between tokens, and puts the SQL on one line if it fits or a clause per line if it doesn't.

```ts
// Before
sql("select id,name from users where id=$1 and bio is not null", 1);
sql(`
  select id
  from users
  where id = $1
`, 1);
sql("select u.id, u.name, count(p.id) as posts from users u left join posts p on p.author_id = u.id group by u.id, u.name order by posts desc");

// After `typesql format`
sql("SELECT id, name FROM users WHERE id = $1 AND bio IS NOT NULL", 1);
sql(`SELECT id FROM users WHERE id = $1`, 1);
sql(`
  SELECT u.id, u.name, count(p.id) AS posts
  FROM users u
  LEFT JOIN posts p ON p.author_id = u.id
  GROUP BY u.id, u.name
  ORDER BY posts DESC
`);
```

The command ships with `@typesql/cli` and reads your project with TypeScript, so it needs `typescript` 7.1 or later:

```sh
pnpm add -D @typesql/cli
pnpm exec typesql format                  # every file of ./tsconfig.json
pnpm exec typesql format src/db           # the project's files under src/db
pnpm exec typesql format --check          # in CI: exit with 1 if a file would change
```

## Which strings are SQL

TypeScript's types decide, not names. A string argument is SQL when TypeSQL types its parameter as SQL, so the command finds `sql(…)`, `sql.fragment(…)`, `sql.prepare(…)`, a transaction's `tx(…)` and a migration's `db.ddl(…)` however you named the variable or passed it around:

```ts
const query = sql;
const repo = { run: sql };

query("select 1");          // formatted
repo.run("select 1");       // formatted
pool.query("select 1");     // pg's own method: left as written
```

`sql.as()`, `sql.raw()` and a migration's `db.raw()` take SQL that TypeSQL doesn't check, so their strings stay as written, like every string that isn't a TypeSQL call's argument. A fragment inside a `${…}` of a template literal is formatted too. Each call is read in the dialect its types name, so a project with several databases needs no configuration.

## What changes

- Keywords (`SELECT`, `LEFT JOIN`, `IS NOT NULL`, `ON CONFLICT … DO UPDATE SET`) get the configured case. Table, column and alias names, type names (`integer`, `timestamptz`), function names (`count`, `coalesce`), strings, quoted names and comments stay as written.
- Runs of spaces become one space, a comma is followed by one space, binary operators get a space on each side (`id = $1`), and the spaces after `(` and before `)`, `,` and `;` are removed.
- The SQL is laid out on lines as [Lines](#lines) describes.

SQLite, MySQL and MariaDB name an unaliased column after its text, so `SELECT count(*), price*qty FROM items` returns the keys `count(*)` and `price*qty`. In those dialects the text of each select or `RETURNING` item without an `AS` alias stays as written, and so does a fragment that starts with an expression rather than a clause keyword, as `sql.fragment("price*qty")`, which may be spliced into a select list. The inferred row types don't change.

## Lines

The SQL goes on one line if it fits within the width, 80 columns by default, from the column of its opening quote to its closing quote; a tab counts as 4 columns. Otherwise each clause starts a line: `SELECT`, `FROM`, each join, `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, `LIMIT`, `OFFSET`, `UNION`, `INSERT INTO`, `VALUES`, `UPDATE`, `SET`, `DELETE FROM`, `ON CONFLICT`, `DO UPDATE SET`, `RETURNING` and the like. A clause that is still too long puts each comma-separated item on a line of its own, or each condition that `AND` or `OR` joins in a `WHERE`, `HAVING` or join:

```ts
sql(`
  SELECT
    u.id AS user_id,
    u.name AS user_name,
    u.email AS user_email,
    p.title AS post_title
  FROM users u
  JOIN posts p ON p.author_id = u.id
  WHERE p.title IS NOT NULL
    AND p.created_at > now() - interval '30 days'
    AND u.active
  ORDER BY p.id
`);
```

Parentheses that don't fit on their line break after `(`, and their contents go on lines one level deeper: a subquery, a CTE's query, an `IN` list or a `CREATE TABLE`'s columns, one per line. A script's statements each start a line, and blank lines are removed.

```ts
db.ddl(`
  CREATE TABLE users (
    id int PRIMARY KEY,
    name text NOT NULL,
    email text,
    active boolean NOT NULL DEFAULT TRUE
  );
  CREATE INDEX users_email ON users (email)
`);
```

SQL that leaves one line goes into a template literal, with a line break after its opening backtick and before its closing one. A string written in `"…"` or `'…'` becomes one when it is too long, and a backtick or `${` in it is escaped; one that fits keeps its quotes. A template literal that already starts on its own line keeps the indentation of its first line and closing backtick; otherwise the SQL is indented one level deeper than the line the string starts on, with a tab or spaces as that line is indented. An escaped line break, as `\n` in a `"…"` string, is a line break like any other.

A line comment keeps a line break after it, so SQL with one is never on one line. A string in a `${…}` hole of another, such as `sql.fragment("…")` inside `sql.and([…])`, is laid out where it ends up: on one line if it fits there, and otherwise indented from that line.

A fragment keeps the whitespace at its edges, since it separates the fragment from what it is spliced next to: `${sql.fragment("ASC")}${sql.fragment(" LIMIT 10")}` must not become `ASCLIMIT 10`. On one line that whitespace is one space; over lines it is the line breaks after the opening backtick and before the closing one. A fragment without it starts right after the backtick and ends right before the closing one:

```ts
const subscriber = sql.fragment(
  `EXISTS (
    SELECT 1
    FROM user_subscription s
    WHERE s.user_id = "user".id AND s.plan_key <> 'free' AND s.user_id > 0
  )`,
);
```

In SQLite, MySQL and MariaDB, the SQL keeps its line breaks as written if an unaliased select item, whose text names its column, is written over several lines.

`format.width` in the config, or `--width`, sets the width.

## Keyword case

Keywords are upper case by default. Set `format.keywordCase` in [`typesql.config.ts`](./migrations#the-typesql-migrate-command), the config of `typesql migrate`, for lower case:

```ts
import { createMigrator } from "@typesql/core/migration";

export default createMigrator({
  dialect: "postgres",
  url: process.env.DATABASE_URL,
  migrationsDir: "./migrations",
  format: {
    keywordCase: "lower", // "upper" (default) or "lower"
    width: 100, // default 80
  },
});
```

`--keyword-case upper` or `--keyword-case lower` overrides the config.

## Options

| Option | Meaning |
|---|---|
| `[files or directories…]` | format only the project's files at or under these paths |
| `--project <file>` | the `tsconfig.json` to read; default `./tsconfig.json`. The projects it references are formatted too |
| `--config <file>` | the config module; default `./typesql.config.ts` |
| `--keyword-case <case>` | `upper` or `lower`; overrides `format.keywordCase` |
| `--width <columns>` | the column a line of SQL ends at; overrides `format.width` |
| `--check` | write nothing; list the files that would change and exit with 1 if there are any |

The command exits with 0 when it's done, 1 when it fails or `--check` finds a file to change, and 2 on invalid usage. It changes only the strings it formats, and writes only the files that change.
