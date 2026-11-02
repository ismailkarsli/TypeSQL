# Postgres compatibility

TypeSQL supports PostgreSQL through node-postgres, postgres.js, Kysely, Drizzle and Prisma. The documented workflows are tested against PostgreSQL 18.6 in a pinned Linux environment.

## How it is tested

`pnpm test:consumer` builds and packs the checkout, installs standalone consumer applications, compiles them, and runs them against fresh databases. Vitest compares public inferred types, compiler diagnostics, runtime results and exceptions, and generated artifacts with reviewed snapshots. See the [workflow inventory](https://github.com/ismailkarsli/TypeSQL/blob/main/tests/inventory.md).

Each permanent bug reproduction is another consumer application using public APIs. Nullable and non-nullable results, wrong arguments, joins, writes, transactions, generators, migrations and introspection are checked through those applications.

## Coverage limits

The former PostgreSQL parser regression, AST, differential-oracle and generated-SQL fuzz suites have been retired. The current suite starts with documented workflows and permanent reproductions; it does not prove correctness for every SQL program. The pinned version provides reproducibility rather than a version compatibility matrix. PostgreSQL's vendored sources remain untouched.

Utility statements without a schema effect (`CREATE INDEX`, `GRANT`, `SET`, `VACUUM`, …) are accepted without detailed parsing. Statements that change the schema type are parsed clause by clause. Some types cannot be known statically; see [Limits](./limits#types-and-hovers).

## Run it yourself

With Node 26, pnpm 12.11.2, and Docker Compose installed:

```sh
pnpm install --frozen-lockfile
pnpm test:consumer
pnpm test:consumer pg-left-join
```

The [consumer test guide](https://github.com/ismailkarsli/TypeSQL/blob/main/tests/README.md) explains snapshot review and how to rerun a retained consumer's ordinary pnpm commands.
