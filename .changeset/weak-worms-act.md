---
"@typesql/core": patch
---

The migrator leaves your connection as it found it after a failure. With `execute`, MySQL gets its autocommit setting back when the history table can't be created, PostgreSQL leaves no transaction open when the migration lock can't be taken, and a failed migration is rolled back even when checking its state fails, where MySQL could otherwise commit it.
