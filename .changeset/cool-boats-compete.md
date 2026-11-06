---
"@typesql/kysely": patch
---

With `mysql` and `sqlite`, a `"db.table"` key of a Kysely `DB` is the table `table` of another (or attached) database, as MySQL and SQLite name it in SQL (`FROM db.table`); a SQLite `"main.table"` key is the main database's table. They were flat keys no statement could name. MySQL and SQLite columns are the dialect's `Col`.
