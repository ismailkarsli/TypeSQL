---
"@typesql/core": patch
---

With `CasePlugin`'s `nested`, a recursive type such as `string | number | boolean | null | JSONType[] | { [key: string]: JSONType }` no longer fails with TS5114 ("appear infinitely circular"), which also made unrelated rows checked after it keep their snake_case keys or become `any`. A type that takes every JSON value stays that type.
