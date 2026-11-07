---
"@typesql/language-server": patch
"typesql": patch
---

SQL completions and highlighting reconnect after the connection to the TypeScript language server is lost, instead of failing until a restart, and a lost connection no longer crashes the language server. A statement cut off while typing, such as `WITH a;`, no longer changes the completions of the next statement.
