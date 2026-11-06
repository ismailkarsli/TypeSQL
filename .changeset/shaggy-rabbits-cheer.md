---
"@typesql/pg": patch
---

`typesql introspect` reads PostgreSQL view plans into objects without a prototype, so a plan field is never confused with an inherited `Object.prototype` member when it infers view column nullability.
