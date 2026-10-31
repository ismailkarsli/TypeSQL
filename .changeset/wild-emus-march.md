---
"@typesql/language-server": patch
---

Stop coloring `{name}` as a fragment slot in `sql()` strings, since `{name}` slots were removed from `@typesql/core`, and treat an interpolated `${…}` hole in a `FROM` clause as a relation when completing columns.
