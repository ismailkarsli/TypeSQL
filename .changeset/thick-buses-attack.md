---
"@typesql/language-server": patch
---

The package ships its type declarations, which read an optional `typescript` peer (7.1 or later), and exports only its main entry point (the `typesql-language-server` command stays). In SQLite, completions after `main.` or `temp.` list the tables the statement uses first, as after `public.` in PostgreSQL.
