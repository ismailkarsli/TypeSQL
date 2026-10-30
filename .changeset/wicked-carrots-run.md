---
"@typesql/pg": patch
---

Stop a dropped connection inside sql.transaction() on a Pool from crashing the process with an unhandled 'error' event; the transaction now rejects and the pool discards the client.
