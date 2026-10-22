## 0.1.0

### Minor Changes

- `createSql<typeof schema>(db)` takes a Drizzle database or transaction on node-postgres or postgres.js instead of an `Executor`, runs the queries on its driver client, and has `sql.transaction(fn)`, which runs in `db.transaction`.

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.1.0
