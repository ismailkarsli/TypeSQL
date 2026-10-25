---
"@typesql/language-server": patch
---

Completions are no longer offered right after the closing quote of a statement literal that ends with an escaped backslash (`"…\\"`), and `typesql-language-server <root>` names that root, not the editor's workspace, when TypeScript cannot start from it.
