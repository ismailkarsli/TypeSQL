---
"typesql": patch
---

The extension bundles its completions instead of loading `@typesql/core/editor` from the project, which needs only `@typesql/core` in `node_modules`.
