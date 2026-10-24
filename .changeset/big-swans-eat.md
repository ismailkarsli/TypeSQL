---
"@typesql/core": patch
---

Lexer errors read like PostgreSQL's: an unterminated literal names where it starts (`unterminated quoted string at or near "'abc"`, `unterminated bit string literal …`), and a character no token starts with is `syntax error at or near "\\"`.
