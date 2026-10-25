---
"@typesql/language-server": patch
---

`typesql-language-server <pipe>` connects to the editor's running TypeScript 7.1 language server through the API pipe from `custom/initializeAPISession` instead of starting a second TypeScript process, and completions are no longer offered right after the closing quote of a statement literal that ends with an escaped backslash (`"…\\"`).
