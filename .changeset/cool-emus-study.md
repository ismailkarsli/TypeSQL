---
"@typesql/core": patch
---

`DECLARE` rejects contradictory options (`ASENSITIVE` with `INSENSITIVE`, `SCROLL` with `NO SCROLL`), and errors after `NO`, `WITH` / `WITHOUT` and a lone sign in `FETCH` point at the token PostgreSQL names.
