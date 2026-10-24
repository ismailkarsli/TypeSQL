---
"@typesql/core": patch
---

"Trailing junk" errors quote the whole junk token (`123abc`, `100__000`, `$0_1`), and invalid Unicode escapes in `E'…'` strings say where they are, as PostgreSQL does.
