---
"@typesql/core": patch
---

Strings and numbers lex like Postgres: `E'\\'` and other escaped backslashes before the closing quote, string literals continued on the next line, `U&'…'` / `U&"…"` with `UESCAPE`, invalid Unicode escapes and trailing junk such as `123abc` are errors, and numbers of any length no longer fail with TS2589.
