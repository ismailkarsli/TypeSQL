---
"@typesql/core": patch
---

Calling `sql` as a template tag, `` sql`…` ``, is a compile error that says to call `` sql(`…`) `` instead and links the TypeScript issue keeping a tag from reading its SQL, rather than one that calls the SQL text not a string literal. In JavaScript it now throws the same message, rather than running a statement without interpolations and breaking one with them.
