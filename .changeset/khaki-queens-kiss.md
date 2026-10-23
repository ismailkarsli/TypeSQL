---
"@typesql/core": minor
---

An optional type cache: with TypeScript 7.1, list `@typesql/core` under `contentMappers` in tsconfig and add a `.typesqlcache` file, and a background job keeps it filled with query, call and DDL results that the checker uses instead of computing them again, only while everything they were computed from is unchanged.
