---
"@typesql/core": major
---

Replace `sql.empty` with `sql.optional(value)`, whose argument is required: it returns the value, or for `undefined` an omission that sends `DEFAULT` in `sql.param()`, is skipped by `sql.combine`, `sql.and` and `sql.or`, and splices nothing when an optional fragment or query is interpolated as `${…}`. `null` is returned as is and stays SQL `NULL`, as in `sql.set`, `sql.values` and `sql.json`, and a fragment or query that can be `null` is a compile error. Write `sql.optional(value ?? undefined)` for `sql.empty(value)` and `value ?? sql.empty`, `sql.optional(value)` where `null` should stay `NULL`, and `sql.optional(undefined)` for a bare `sql.empty`. Add `sql.if(value, then)`, which returns the fragment or query `then(value)` builds when `value` is truthy, with `value` narrowed to its truthy type, and the same omission otherwise, as in ``sql.and([sql.if(search, (s) => sql.fragment(`"name" ILIKE ${sql.param(s)}`))])``.
