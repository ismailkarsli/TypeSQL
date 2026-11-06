---
"@typesql/drizzle": patch
---

On TiDB Cloud and PlanetScale serverless, values are written into the statement as escaped literals, as `@typesql/mysql` does: the client's own `?` substitution also replaced a `?` inside a string literal.
