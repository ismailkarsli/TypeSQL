---
description: "Format the SQL inside TypeSQL calls with typesql format: one keyword case, tidy spacing, found through TypeScript's types whatever the functions are named."
---

# Formatting SQL

`typesql format` formats the SQL that TypeSQL checks: it writes every keyword in one case and tidies the spaces between tokens.

```ts
// Before
sql("select id,name from users where id=$1 and bio is not null order by id desc", 1);

// After `typesql format`
sql("SELECT id, name FROM users WHERE id = $1 AND bio IS NOT NULL ORDER BY id DESC", 1);
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
- Line breaks and indentation stay, and spaces at the end of a line are removed. Escapes such as `\n` in a quoted string stay as written.

SQLite, MySQL and MariaDB name an unaliased column after its text, so `SELECT count(*), price*qty FROM items` returns the keys `count(*)` and `price*qty`. In those dialects the text of each select or `RETURNING` item without an `AS` alias stays as written, and so does a fragment that starts with an expression rather than a clause keyword, as `sql.fragment("price*qty")`, which may be spliced into a select list. The inferred row types don't change.

## Keyword case

Keywords are upper case by default. Set `format.keywordCase` in [`typesql.config.ts`](./migrations#the-typesql-migrate-command), the config of `typesql migrate`, for lower case:

```ts
import { createMigrator } from "@typesql/core/migration";

export default createMigrator({
  dialect: "postgres",
  url: process.env.DATABASE_URL,
  migrationsDir: "./migrations",
  format: { keywordCase: "lower" }, // "upper" (default) or "lower"
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
| `--check` | write nothing; list the files that would change and exit with 1 if there are any |

The command exits with 0 when it's done, 1 when it fails or `--check` finds a file to change, and 2 on invalid usage. It changes only the strings it formats, and writes only the files that change.
