---
"@typesql/core": patch
---

The types of `sql()`, `sql.fragment()`, `sql.combine()`, `sql.and()` and `sql.or()` read MySQL, MariaDB and SQLite text by their own rules too: backtick- and bracket-quoted names, backslash escapes in MySQL strings, `#` comments, `--` without a following space in MySQL and block comments, which these databases do not nest, no longer make `sql()` require or number `:name` and `$n` parameters the database does not have.
