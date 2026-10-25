---
"@typesql/core": patch
---

The lexer reads numbers and whitespace as PostgreSQL does: a radix literal followed by more identifier characters is one junk token (`0o19`, `0b12`, `0xg` are `trailing junk after numeric literal`, `0x_` is `invalid hexadecimal integer at or near "0x_"`), and a statement with a run of 1000 or more whitespace characters is lexed instead of failing with "Type instantiation is excessively deep".
