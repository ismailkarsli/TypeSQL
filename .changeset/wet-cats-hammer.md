---
"@typesql/cli": minor
---

New `typesql format` command: it writes the keywords of every SQL string TypeSQL checks in one case and tidies the spaces between its tokens. TypeScript's types find the SQL, so `sql()`, `sql.fragment()`, `sql.prepare()`, a transaction's `tx()` and a migration's `db.ddl()` are formatted whatever they are named, in the dialect their types name. Names, types, functions, strings, comments and line breaks stay as written, and so does the text of an unaliased select item on SQLite, MySQL and MariaDB, which name the column after it. Keywords are upper case unless `typesql.config.ts` sets `format: { keywordCase: "lower" }` or `--keyword-case` overrides it; `--check` exits with 1 when a file would change.
