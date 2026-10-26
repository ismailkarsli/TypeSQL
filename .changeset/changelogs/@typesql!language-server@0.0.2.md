## 0.0.2

### Patch Changes

- Editor completions offer the `RETURNING` columns of a data-modifying WITH query (`WITH x AS (INSERT … RETURNING b) SELECT x.|`), and stay quiet inside a dollar-quoted string whose tag is longer than 62 characters or not ASCII; a lone carriage return ends a `--` comment, as in PostgreSQL.

- Completions in `sql()` strings read more of the statement: a comma after `JOIN … ON …` or `JOIN … USING (…)` offers tables and one after `SELECT DISTINCT ON (…) a` or `ORDER BY a USING <` columns; `INSERT INTO t TABLE` offers tables and `FOR UPDATE` no longer does; `ON CONFLICT (…)` and `RETURNING` offer the target's columns after `INSERT … SELECT … UNION …`; and the columns of a subquery with `DISTINCT ON (…)` or a `{slot} alias` item are read right.

- `typesql-language-server <pipe>` connects to the editor's running TypeScript 7.1 language server through the API pipe from `custom/initializeAPISession` instead of starting a second TypeScript process, and completions are no longer offered right after the closing quote of a statement literal that ends with an escaped backslash (`"…\\"`).

- Build and type-check the package with `tsrs`.
