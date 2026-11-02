# Documented workflow inventory

This inventory was written from the maintained library READMEs, documentation guides, adapter pages, and public export maps. Each row names executable consumer projects, including rejection or rollback outcomes. Editor features and the language server are excluded. SQL language features are exercised through these public workflows; this is not an exhaustive SQL grammar inventory.

| Documented workflow | Scenarios | Observations |
|---|---|---|
| Quick start; hand-written schema; reads and nullable/non-nullable columns | `pg-quick-start`, `pg-left-join` | Inferred rows, first/missing rows, outer-join nullability and narrowing, actual results |
| Query construction, positional/named/inline parameters, custom execution, unbound queries, executor override, `mapRows` | `core-workflows`, `runtime-no-executor` | Public types, assembled SQL/values, actual execution, explicit missing-executor exception |
| Plugins: camelCase output and write keys; custom typed output | `core-workflows`, `pg-writes` | Inferred output wrappers, renamed input and result keys, database writes |
| Fragments, optional/conditional pieces, identifiers, runtime lists, conjunction/disjunction, subqueries, dynamic raw SQL and `sql.as` | `core-workflows`, `pg-dynamic-sql`, `runtime-inline-reuse` | Inferred types, parameter renumbering, actual results, single-use marker error |
| Insert/update/delete, bulk values, partial sets, returning rows, affected counts | `pg-writes`, `node-sqlite`, `better-sqlite3`, `bun-sqlite` | Database contents, write counts, inferred returned rows |
| Typed JSON, JSON parameters and arrays, generated JSON objects | `pg-json` | Fully expanded public shapes and nested actual output |
| node-postgres execution and prepared statements | `pg-quick-start`, `pg-prepared`, `pg-driver-values` | Rebinding, first/missing results, Date/numeric/int8/null representations |
| postgres.js execution, preparation, transactions and bigint parsers | `postgresjs-workflows` | Public types, rollback, driver strings and explicitly configured bigints |
| SQLite: node:sqlite, better-sqlite3, bun:sqlite | `node-sqlite`, `better-sqlite3`, `bun-sqlite` | Reads/writes, prepared statements, named parameters, rollback, large bigint, driver-specific numeric division |
| Transactions and nested savepoints | `pg-transactions`, adapter/ORM consumers | Aborted transfer balances, preserved outer writes, reverted inner writes |
| Expired transaction rejection | `pg-ended-transaction` | Specific application exception after callback completion |
| Empty results and documented errors | `pg-no-result`, `runtime-no-executor`, `runtime-inline-reuse` | Exit status and actual exception name/message/query, full stderr |
| Compiler rejection: invalid SQL, wrong positional/inline arguments, NOT NULL writes and missing required fields | `compiler-rejection`, `compiler-nullability` | Exact diagnostics, code/message/location/expression, no suppressed expected errors |
| Required strictNullChecks and pnpm direct dependencies | `compiler-strict-null-checks`, `compiler-undeclared-dependency` | Exact rejection, including inability to import transitive core from an adapter-only application |
| Kysely schema conversion and execution, PostgreSQL and SQLite | `kysely-postgres`, `kysely-sqlite` | Schema inferred from actual Kysely instances, ORM seed data, typed SQL reads, rollback |
| Drizzle schema conversion and execution on node-postgres, postgres.js and SQLite | `drizzle-pg`, `drizzle-postgres`, `drizzle-sqlite` | SQL column names from mapped fields, nullable rows, execution through each documented PostgreSQL client and a SQLite database, rollback |
| Prisma generated-client conversion, PostgreSQL and SQLite | `prisma-client-postgres`, `prisma-client-sqlite` | Actual generated clients, compiler checking, ORM writes, typed SQL reads and transaction rollback |
| TypeSQL Prisma generator, PostgreSQL and SQLite | `prisma-generation-postgres`, `prisma-generation-sqlite` | Generated schema text (mapped names, native types, defaults, nullable fields), compilation and execution against the same generated client |
| CLI introspection and generated-schema consumption, PostgreSQL and SQLite | `cli-introspect-postgres`, `cli-introspect-sqlite` | Real database introspection, full generated schema, compiled and executed consumer |
| CLI migration files/config, status/generate/up/down/latest | `cli-migrations-postgres`, `cli-migrations-sqlite` | Pending status, migration progress, generated DB schema, compilation and writes using that schema |
| CLI migration creation | `cli-make` | Fixed timestamp input, generated migration source, compilation and execution of the generated migration |
| CLI invalid usage | `cli-invalid-command` | Explicit command rejection with exit 2 and exact usage/error text; no dependent compile/run |
| Programmatic migration arrays, `latest`, `status`, `with`, `down`, failure and transaction settings | `migrations-postgres`, `migrations-sqlite` | History, failed migration name, rollback flag, earlier committed migrations, missing rolled-back table, deliberately partial nontransactional state, idempotence and reverse migration |
| Supported ESM entry points and Node require of ESM | `module-entry-points`, the integration consumers | Actual public imports, CLI API, introspection and generator entry points; engine declaration entry points are loaded without using internals to execute or verify applications |
| Compiler observer calibration | `observation-shapes` | Aliases, inferred literals, nullable arrays, optional/readonly fields, unions, tuples, visible any/unknown/never |

New documented workflows must add a row or extend the relevant consumer. A bug reproduction remains as an ordinary scenario. No retired corpus was imported to create this inventory.
