---
"@typesql/core": patch
---

Type checking is about 7% faster: the lexer handles punctuation, `=`, `::` and `.` without trying every operator, cutting its type instantiations by about 20%.
