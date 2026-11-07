---
"@typesql/language-server": minor
---

`formatLiteral()` takes `fragment`, to keep the whitespace at a fragment's edges, and `position`, where the literal ends up; its `hole` callback gets the position of each `${…}` hole it writes. `advance()` moves a position past a text.
