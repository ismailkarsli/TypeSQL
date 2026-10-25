---
"@typesql/core": patch
---

`CYCLE … SET mark TO v DEFAULT d` with a type that has no equality operator (box, circle, jsonpath, line, lseg, path, pg_snapshot, refcursor, txid_snapshot, besides point, polygon, json and xml) or no `<>` (aclitem, cid) is rejected, as in PostgreSQL; with a value of type `unknown` and NULL or another `unknown` the mark is text.
