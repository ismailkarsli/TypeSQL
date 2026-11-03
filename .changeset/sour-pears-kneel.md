---
"@typesql/core": major
---

An exported function that returns an unexecuted `sql()` or `sql.prepare()` query again compiles with `declaration: true` (or `composite`) when the type map, plugin types or plugin classes are not exported: a query is typed `Query<Row, Params, Text>` again, as before 5.0.2, instead of `InferredQuery<…>`, which is no longer exported.
