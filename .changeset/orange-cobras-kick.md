---
"@typesql/mysql": patch
---

`stream()` reads rows with mysql2's `query().stream()` and the mariadb connector's `queryStream()`, checking a connection out of a pool for the stream. On PlanetScale and TiDB Cloud it rejects.
