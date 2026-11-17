---
"@typesql/core": patch
---

An unknown PostgreSQL function with a long name, such as `invitation_preview(...)`, is reported as the function that does not exist, with its suggestion. Before, the hint's edit distance overflowed TypeScript (`TS5115: Instantiations ... appear infinitely circular: 'Min', 'Lev'`) and the message was lost.
