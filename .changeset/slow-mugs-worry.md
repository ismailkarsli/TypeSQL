---
"typesql": major
---

Stop coloring `{name}` as a fragment slot, since `{name}` slots were removed from `sql()`; interpolated `${fragment}` holes stay TypeScript, and completion treats a hole in a `FROM` clause as a relation.
