---
"typesql": patch
---

Completions work in `sql.prepare()` and `sql.raw()` strings, and in a migration's `db()`, `.ddl()`, `.add()` and `.raw()` strings. With semantic highlighting, SQLite strings are colored as SQLite (`[name]` and backtick names, `?`, `@name` and `$name` parameters), and PostgreSQL strings as PostgreSQL: backslash escapes in `E'…'` strings, and `#` and backticks as operators, not a comment and a name. In SQLite, completions after `main.` or `temp.` list the tables, with those the statement uses first.
