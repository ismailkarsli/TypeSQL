---
"@typesql/language-server": patch
---

Treat a completion request without a result as TypeScript's null instead of failing, so Neovim configs that drop a nil result still get TypeSQL completions.
