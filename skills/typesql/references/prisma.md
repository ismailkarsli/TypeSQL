# Prisma

`pnpm add @typesql/core @typesql/prisma`, with `@prisma/client` 7+ and a matching `prisma` CLI. Use the generator, which keeps database names, native types and defaults, then run `prisma generate`:

```prisma
generator typesql {
  provider = "typesql-prisma"
  output   = "../src/db/typesql.ts"
}
```

`createSql<DB>(dialect, prisma)` takes a client, an extended client or a transaction client. `sql.transaction` is `prisma.$transaction`. Values are always bound, despite the `$queryRawUnsafe` underneath.

- `uuid()`, `cuid()`, `nanoid()`, `ulid()` and `@updatedAt` are client-side, so raw `INSERT`s must set them.
- SQL uses `@map` names. Quote mixed-case names on PostgreSQL.
- Rows are `$queryRaw` output: `count(*)` is usually `bigint`, and `JSON.stringify` throws on it.
- Migrator: give it `url`, not Prisma as `execute`.
- Without the generator, `createSql(dialect, prisma)` uses model and field names and connector default types. `FromPrisma<Prisma.TypeMap, Overrides>` takes `$table`, `$schema`, `$types` and per-field `{ column, type, nullable, default }`. Mark client-side defaults `{ default: false }`.
