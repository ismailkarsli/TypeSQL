---
"typesql": patch
---

Highlight SQL in migration files: db.add(…), db.raw<Schema>(…) and migrations().add(…) strings that start like a SQL statement, and stop TypeScript colors after a member call such as db.mySql("…") from leaking into the following lines.
