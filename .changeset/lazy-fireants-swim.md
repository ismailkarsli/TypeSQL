---
"@typesql/sqlite": patch
---

`typesql introspect` keeps a table whose name starts like a virtual table's, such as `docs_archive` next to an FTS table `docs`: shadow tables are the ones SQLite reports as such (SQLite 3.37 or later).
