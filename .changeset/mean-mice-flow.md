---
"@typesql/core": patch
---

Let CasePlugin writes use a column's own snake_case name when its camelCase name wouldn't convert back to it, so columns like address_line_1 can be written.
