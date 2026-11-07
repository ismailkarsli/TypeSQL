---
"@typesql/core": minor
---

The `nested` option of `CasePlugin` takes `"output"`, which renames keys inside values in rows only, `"input"`, which renames them in `sql.json()`, `sql.param()` and the values of `sql.set()` and `sql.values()` only, or `"all"` for both. With `"output"` these values are stored as written and their input types stay the plain `T`. `nested: true` is replaced by `nested: "all"`: it is now a compile error, and throws in untyped code.
