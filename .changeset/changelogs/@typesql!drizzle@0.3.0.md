## 0.3.0

### Minor Changes

- Breaking: TypeSQL is split into a dialect-neutral core and a PostgreSQL dialect. `@typesql/core` keeps what dialects share (`createSql`, queries, fragments, executors, row keys, transactions, migrations, the schema markers `Col`, `Nullable`, `Generated`, `View`, … and the type cache) and adds a dialect contract. PostgreSQL moves to `@typesql/core/postgres`: create a `sql` with `createSql<DB>(postgres, executor?)`, import `Json`, `PgCatalog`, `migrations()`, type maps and the function catalog from `@typesql/core/postgres` (which also re-exports the schema markers), and the engine types from `@typesql/core/postgres/engine` (was `@typesql/core/engine`). The Kysely, Drizzle and Prisma packages take the dialect the same way and read the schema from the client's type: `createSql(postgres, db)` (`createSql<DB>(postgres, db)` still picks a schema explicitly). `typesql introspect` and the Prisma generator import the column helpers from `@typesql/core/postgres` by default.

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.8.0
