---
"@typesql/drizzle": patch
---

On postgres.js, read `timestamp` (without time zone) columns and arrays as UTC, as Drizzle's `timestamp()` does, so a `Date` comes back unchanged whatever the process time zone; parse `date`, `timestamp`, `timestamptz` and `numeric` arrays of any dimension; and send JS arrays of strings, numbers, bigints, booleans and dates as array literals, so `Date[]` and `numeric[]` parameters work.
