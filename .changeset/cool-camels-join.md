---
"@typesql/cli": patch
---

Write `db.ts` for migration histories of any length: `typesql migrate generate`, and the schema file written after `up`, `down` and `latest`, read each migration after the files it imports, so a history of 29 or more migrations no longer writes a garbage schema such as `"__@ERR@…": { toString: …; charAt: … }` or fails with "up's return type is untyped". A schema TypeScript could not compute (an error type, `never`, or a type error from a wrong statement) is now an error naming the migration, and nothing is written.
