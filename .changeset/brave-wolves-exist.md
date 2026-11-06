---
"@typesql/core": patch
---

TypeSQL reads MySQL, MariaDB and SQLite statements by their own rules: in `sql()`, `sql.fragment()`, `sql.raw()` and the `$n` rewriting of the MySQL and SQLite drivers, backtick- and bracket-quoted names, backslash escapes in MySQL strings, `#` comments and block comments, which these databases do not nest, no longer hide or invent `:name` parameters and inline values.
