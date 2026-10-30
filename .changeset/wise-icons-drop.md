---
"@typesql/language-server": patch
---

Complete SQL in core's createSql(dialect).withPlugin(…), after ${sql.param("x")} and after a /* sql */ marker; escape quoted names inserted into "…" and '…' strings; and complete columns after an escaped \"Quoted\" table.
