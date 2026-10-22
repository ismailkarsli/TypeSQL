---
"@typesql/core": patch
---

Add write helpers: `sql.valueOrDefault(x)` sends `DEFAULT` when `x` is `undefined`, and `sql.set(table, partial)` / `sql.values(table, rows)` build typed `SET` lists and `VALUES` rows from objects. `DEFAULT` outside a `VALUES` item or `SET` value, or for a `NOT NULL` column without a default, is now a compile error.
