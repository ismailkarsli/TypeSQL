---
"@typesql/cli": minor
---

Add typesql migrate generate, which writes the schema of the last migration to db.ts, and write it after migrate up, down and latest unless --no-generate or generate: false is set; schemaFile and --out change the path.
