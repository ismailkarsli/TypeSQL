---
"@typesql/language-server": patch
---

Completions work in `sql.prepare()` and `sql.raw()` strings, and in a migration's `db()`, `.ddl()`, `.add()` and `.raw()` strings. SQLite strings are read as SQLite: `[name]` and backtick names, `?`, `?1`, `@name` and `$name` parameters, and block comments that don't nest; and `FROM main.` and `FROM temp.` list the tables, as their columns already resolved. In PostgreSQL, backslash escapes in `E'…'` strings no longer end the string early. Names that need quoting come from `@typesql/core`'s keyword lists.
