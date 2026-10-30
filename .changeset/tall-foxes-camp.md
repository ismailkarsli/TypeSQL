---
"@typesql/drizzle": patch
---

On drizzle-orm/postgres-js, serialize sql.json(), object and Date parameters and parse date, timestamp and timestamptz columns back to Date, since Drizzle turns off postgres.js' own serializers and parsers; on better-sqlite3, execute() on INSERT, UPDATE and DELETE without RETURNING no longer throws.
