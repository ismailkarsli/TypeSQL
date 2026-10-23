---
"@typesql/core": minor
---

Type-level hooks for an optional type cache: query, call and DDL results can come from a generated cache (`QueryCache`, `DdlCache`), used only while everything they were computed from is unchanged; without one nothing changes.
