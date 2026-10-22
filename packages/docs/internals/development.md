# Development

The repository is a pnpm workspace: `packages/core` (`@typesql/core`), the driver adapters
`packages/pg` and `packages/postgres`, the ORM schema packages `packages/kysely`,
`packages/drizzle` and `packages/prisma`, `packages/bench` and this site, `packages/docs`.

```sh
pnpm install
pnpm typecheck                 # tsc per package, including the docs and package examples
pnpm test                      # vitest: runtime tests, type tests, conformance against Postgres
pnpm build && pnpm smoke:dist  # build the packages, then import the built output with plain Node
pnpm docs:dev                  # this site, with hot reload
pnpm docs:deploy               # build this site and deploy it to typesql.karsli.net
pnpm change                    # record a change intent; see Releasing
```

Type tests live in `packages/*/test/**/*.test-d.ts` and use `expectTypeOf` and
`// @ts-expect-error`. The engine's design rules and the TypeScript limits they work around
are in [Type engine](./engine). Versioning and publishing are in [Releasing](./releasing).

## Conformance tests

`packages/core/test/conformance/` ties compile-time inference to real driver behaviour.
`corpus.ts` holds SELECT statements as
`{ name, setup: string[], sql, params, expectKeys: string[], expectTypes: Record<col, typeof> }`
plus a shared `schema` (DDL + seed) and the matching `ConformanceDB` interface.

- `conformance.test-d.ts` (type level) asserts, for every entry, that
  `keyof RowOf<ConformanceDB, DefaultTypeMap, sql>` equals the union of `expectKeys`, and that
  each `expectTypes` category is one the inferred TS type can produce (`string | null`
  admits `"string"` and `"null"`).
- `conformance.test.ts` (runtime) runs `schema`, then every entry (its `setup`, then `sql`
  with `params`) through **both** `pg` and postgres.js, and asserts the returned row object's
  keys equal `expectKeys` in order and `typeof` each value (`"null"` for SQL NULL) equals
  `expectTypes`. Duplicate column names collapse to one key, last value wins, in both drivers.

Database selection (`db.ts`):

1. `TYPESQL_PG_URL=postgres://user:pw@host:port/db` — used as is. **Destructive**: the three
   corpus tables (`users`, `posts`, `settings`) are dropped and recreated.
2. Otherwise `docker run -d --rm -e POSTGRES_PASSWORD=typesql -p 127.0.0.1:<free port>:5432 postgres:17`
   (override the image with `TYPESQL_PG_IMAGE=postgres:18`), wait until a TCP connection works,
   run, then `docker rm -f`.
3. If neither is possible the suite is skipped with a warning, not failed.

```sh
./node_modules/.bin/vitest run --project core                 # docker fallback
TYPESQL_PG_URL=postgres://postgres:typesql@localhost:5432/postgres ./node_modules/.bin/vitest run --project core
```

To add a case: append to `corpus` (keep `as const` so `sql` stays a literal type), add any
new table to both `schema` and `ConformanceDB`, and give `expectTypes` the `typeof` of the
first returned row — use `ORDER BY`/`LIMIT` so that row is deterministic.

## Compile-time bench

`packages/bench` measures what the engine costs the compiler:

```sh
node packages/bench/gen.mjs              # writes src/q1.ts, q50.ts, q500.ts, maxlen.ts
node packages/bench/run.mjs              # tsc --extendedDiagnostics per file; exit 1 on a threshold breach
node packages/bench/run.mjs --calibrate  # rewrite thresholds.json from the measured numbers
```

`qN.ts` holds N distinct realistic SELECTs; `maxlen.ts` holds one statement per size probe
(0.5, 1, 2, 4 and 8 KB). `thresholds.json` caps instantiations (30% headroom: they are
deterministic), check time (2x: it is noisy), errors, and the largest statement that must
still infer. CI runs the bench as a separate job.

Current numbers on TypeScript 7.0.2:

| File | Instantiations | Check time |
|---|---|---|
| q1 | ~130K (mostly loading the library) | ~0.3 s |
| q50 | ~0.67M | ~0.7 s |
| q500 | ~5.1M | ~3.9 s |
| maxlen (all probes pass, up to 8 KB) | ~6.7M | ~1.6 s |

## Function catalog review

`scripts/catalog-from-pg.mjs` prints every `pg_proc` overload of each function in the catalog
(argument and return types, strict / aggregate / window / set-returning flags) and lists
catalog names Postgres does not have, for a manual diff after a Postgres upgrade:

```sh
TYPESQL_PG_URL=postgres://postgres:x@localhost:5432/postgres node scripts/catalog-from-pg.mjs [names…]
```

## System catalog slice

`packages/core/src/schema/pg-catalog.ts` (`PgCatalog`) is generated from a live server. The
relation list is `RELATIONS` in `scripts/pg-catalog-from-pg.mjs`. Column types come from
`pg_attribute`, with domains replaced by their base type. Table columns are `NOT NULL` when
`attnotnull` is set. View columns are `NOT NULL` only when the view's query tree
(`pg_rewrite.ev_action`) proves it. Set-returning function columns are nullable unless they
are in `FUNCTION_COLUMNS_NOT_NULL`.

```sh
TYPESQL_PG_URL=postgres://postgres:x@localhost:5432/postgres node scripts/pg-catalog-from-pg.mjs [--check]
```

The view analysis lives in `packages/pg/src/introspect/nullability.ts`, shared with
`typesql introspect`; its end-to-end test (`packages/pg/test/introspect/`) compares the output
for a fixture database with `schema.generated.ts` (`TYPESQL_UPDATE_FIXTURES=1` rewrites it) and
type-checks queries against that file.

`packages/core/test/conformance/pg-catalog.test.ts` regenerates the file and compares it when the
server's major version matches the file's. On any version it selects every relation through
both drivers and checks the column order, that `NOT NULL` columns hold no NULLs, and the
`typeof` of every value.
