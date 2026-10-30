---
"@typesql/core": patch
---

Leave {name} inside string literals, quoted identifiers, comments and dollar quotes alone instead of treating it as a fragment slot, so '{k}'::text[] and jsonb paths like '{k}' compile, and stop E'…' strings with escaped quotes from breaking :name parameters.
