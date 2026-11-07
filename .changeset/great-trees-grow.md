---
"@typesql/cli": patch
---

`typesql format` keeps the whitespace at the edges of a fragment, which separates it from what it is spliced next to, so `${sql.fragment("ASC")}${sql.fragment(" LIMIT 10")}` no longer becomes `ASCLIMIT 10`. A fragment in another's `${…}` hole is laid out where it ends up and breaks over lines if it doesn't fit there, rather than staying on one line of any length. A template literal's SQL is indented with the template's own tabs or spaces.
