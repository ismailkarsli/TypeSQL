---
"@typesql/core": patch
---

A missing relation written with `public.` keeps it in the error (`relation "public.t" does not exist`), and errors about a schema-qualified name point at the name, as in PostgreSQL.
