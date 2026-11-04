---
"@typesql/language-server": patch
---

The exported `TypeScriptModules` type accepts the `SyntaxKind` enum of `typescript/ast` as it is, reverse mapping included, without a cast.
