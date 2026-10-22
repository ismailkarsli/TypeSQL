## 0.0.3

### Patch Changes

- `JSONColumnType` columns holding an array are inferred as `jsonb` instead of a Postgres array (`text[]`, `jsonb[]`).

- Kysely columns typed `Record<string, …>` are inferred as `jsonb` instead of the interval object.

- Updated dependencies:
  - @typesql/core@0.0.3
