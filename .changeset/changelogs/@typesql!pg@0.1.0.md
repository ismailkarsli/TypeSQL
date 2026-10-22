## 0.1.0

### Minor Changes

- Queries run from the `sql` bound to your client: `createSql<DB>(client)` then `sql("…").execute()` (or `executeTakeFirst`, `executeTakeFirstOrThrow`, `executeCount`), and `sql.transaction(async (tx) => …)` for transactions, nested with savepoints; the `query`, `one`, `maybeOne`, `many`, `execute`, `transaction` and `RowCountError` exports of `@typesql/pg` and `@typesql/postgres`, `query` and `execute` of `@typesql/kysely`, and `queryRaw` and `executeRaw` of `@typesql/prisma` are removed.

### Patch Changes

- The README links to the type map tables on the new node-postgres and postgres.js adapter pages of the docs.

- Updated dependencies:
  - @typesql/core@0.1.0
