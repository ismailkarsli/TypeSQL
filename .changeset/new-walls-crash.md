---
"@typesql/core": major
---

Interpolate fragments into the SQL template: every `sql.*` fragment (`sql.fragment`, `sql.id`, `sql.combine`, `sql.and`, `sql.or`, `sql.set`, `sql.values`, `sql.raw`) and a whole query can be written as `${fragment}` in `sql()`, `sql.prepare()`, `sql.as()` and `sql.fragment()`, and the statement is checked with the fragment spliced in, nested queries included. `{name}` slots and the slot-map argument are removed: replace `sql("… {where}", { where }, ...params)` with ``sql(`… ${where}`, ...params)``, and `sql.prepare(text, slots)` with `sql.prepare(text)`; a `{name}` left in the SQL is now a syntax error. Fragment and `Query` types are also string types, so a fragment or query passed as a parameter value, to `sql.param()` or to `sql.id()` throws.
