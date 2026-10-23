# Development

The repository is a pnpm workspace: `packages/core` (`@typesql/core`), the driver adapters
`packages/pg` and `packages/postgres`, the ORM schema packages `packages/kysely`,
`packages/drizzle` and `packages/prisma`, `packages/bench` and this site, `packages/docs`.

```sh
pnpm install
pnpm typecheck                 # tsc per package, including the docs and package examples
pnpm test                      # vitest: runtime tests, type tests, conformance against Postgres
pnpm build && pnpm smoke:dist  # build the packages, then import the built output with plain Node
pnpm pg-regress:setup          # check out PostgreSQL's regression tests (vendor/postgres)
pnpm test:pg-regress           # the parser against them; see PostgreSQL regression tests
pnpm playground [--check]      # regenerate (or check) the TypeScript Playground links
pnpm cache-version [--check]   # update (or check) CacheVersion after changing core's types
pnpm docs:dev                  # this site, with hot reload
pnpm docs:deploy               # build this site and deploy it to typesql.karsli.net
pnpm change                    # record a change intent; see Releasing
```

Type tests live in `packages/*/test/**/*.test-d.ts` and use `expectTypeOf` and
`// @ts-expect-error`. The engine's design rules and the TypeScript limits they work around
are in [Type engine](./engine). Versioning and publishing are in [Releasing](./releasing).

`CacheVersion` (`packages/core/src/engine/cache.ts`) is a hash of core's type-level sources: a
type cache entry made by another version is never used. After changing anything under
`packages/core/src` (except `src/cache/` and `src/runtime/`), run `pnpm cache-version`; CI runs
it with `--check`.

## Playground links

The README, the package READMEs and this site link to the TypeScript Playground. Each link
opens one file from `packages/docs/playground/`, encoded in the URL, and the Playground loads
the published packages from npm. A Markdown line with a link carries a `playground:<name>`
marker naming its file: in an HTML comment, or in a YAML comment in frontmatter.

After editing a file there, run `pnpm playground` to rewrite the links. `pnpm playground --check`
(run in CI) fails when a link is stale or when a file does not compile as marked: lines ending
in `// error …` must fail, and every other line must compile. It checks against the workspace
sources with TypeScript 7. The Playground runs its own latest TypeScript (6.0 as of October
2026) against the published packages, so open the links after a change to the examples or a
release.

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

## PostgreSQL regression tests

`vendor/postgres` is a git submodule of [PostgreSQL](https://github.com/postgres/postgres)
pinned to a release tag (`REL_18_6`). The parser is tested against its regression suite,
`src/test/regress/sql/*.sql`, with `src/test/regress/expected/*.out` as the record of what
Postgres did with each statement.

**These files are the gold source. Never modify, reformat, add or delete anything under
`vendor/postgres`**, not even to skip a statement or work around a failure. The runner refuses to
run when the submodule has local changes. Disagreements are recorded on our side, in
`packages/core/test/pg-regress/baseline.json`.

```sh
pnpm pg-regress:setup             # sparse, shallow checkout of the pinned commit (~20 MB)
pnpm test:pg-regress              # all 233 files, ~1 min, under 1 GB of memory
pnpm test:pg-regress join with    # only these files
pnpm test:pg-regress --update     # rewrite baseline.json (only the named files' entries, if named)
```

A plain `git submodule update --init vendor/postgres` works too; it checks out the whole
PostgreSQL tree. CI runs the suite as its own job, `pg-regress`; `pnpm test` does not run it.

How a run works (`packages/core/test/pg-regress/`):

1. `psql.mjs` splits each `.sql` file into the statements psql sends, following psql's lexer
   (`src/fe_utils/psqlscan.l`): quotes and dollar quotes, nested comments, parentheses,
   `BEGIN ATOMIC` bodies, `\;`, `\g` and friends, `\r`, `\if` with a literal condition, COPY FROM STDIN data and
   `standard_conforming_strings`. psql variables are substituted where the text psql sends is
   known (`:'v'` is a string literal and `:"v"` an identifier whatever their value; `:v` after
   `\set v value`). Two kinds of statements are not checked: those that use a psql variable whose
   value we don't have (set by `\gset`, `\getenv` or psql itself), and those run with
   `standard_conforming_strings` off that contain a backslash, whose string literals mean
   something else than the parser (which follows the default) reads.
2. It finds each statement's outcome in the expected output (`psql -a` echoes the input, so the
   result of a statement is what follows its last line): `ok`, `error` (Postgres parsed it, then
   failed), `syntax-error` (an error of the scanner or the grammar, `… at or near "…"` /
   `at end of input`, without a `CONTEXT` line, and with the caret outside string literals: a syntax error in a function body,
   which Postgres parses while running CREATE FUNCTION or DO, is an `error`), or `unknown` when
   it cannot tell.
3. `run.mjs` writes one `.ts` file per test to `node_modules/.cache/typesql-pg-regress/`, each
   statement checked as `ParseProgram<Lex<sql>>`, runs `tsc` over them in batches of about 6000
   statements (one run over all of them needs ~3 GB) and reads the result of every statement from
   the diagnostics.

A disagreement is one of:

- `rejects`: Postgres parsed the statement, our parser returns an error. When Postgres failed
  after parsing and our error is a semantic one too (not a syntax error, an unsupported feature
  or a lexical error), both reject the statement and they agree.
- `accepts`: Postgres reported a syntax error, our parser accepts the statement. Utility
  statements the parser skips to the next `;` without validating them (CREATE INDEX, GRANT,
  SET, …; the summary counts them) are not counted.
- `crash`: the compiler gave up on the statement (e.g. TS2589), whatever Postgres did.

`baseline.json` lists every current disagreement by file, kind and a hash of the statement text
(there are none today: see [Postgres compatibility](../guide/postgres-compatibility)),
with its line, a preview, Postgres's error and ours for reading. The run fails when a
disagreement is not listed (a regression: fix the parser) and when a listed one no longer occurs
(an improvement: run `--update` so the list only shrinks). It also fails when the baseline was
written for a different commit of `vendor/postgres`.

To move to a new PostgreSQL release:

```sh
pnpm pg-regress:setup REL_18_7    # fetch and check out the tag
pnpm test:pg-regress --update     # review the baseline diff: new statements, new disagreements
git add vendor/postgres packages/core/test/pg-regress/baseline.json
```

## Compile-time bench

`packages/bench` measures what the engine costs the compiler:

```sh
node packages/bench/gen.mjs              # writes src/q1.ts, q50.ts, q500.ts, mixed50.ts, maxlen.ts
pnpm --filter @typesql/core build        # the …d and …c variants use the built package
node packages/bench/run.mjs              # tsc --extendedDiagnostics per variant; exit 1 on a threshold breach
node packages/bench/run.mjs --calibrate  # rewrite thresholds.json from the measured numbers
```

`qN.ts` holds N distinct realistic SELECTs; `mixed50.ts` holds 50 statements that use inline
`${sql.param()}` values, `:name` parameters, one `{slot}` fragment shared by many statements
and `sql.id`; `maxlen.ts` holds one statement per size probe (0.5, 1, 2, 4 and 8 KB).
Each file is measured in up to three ways: against core's TypeScript sources (`q1` … `maxlen`),
against the built package with `skipLibCheck`, as an application compiles (`q1d`, `q50d`,
`q500d`), and with a [type cache](../guide/caching) generated for the file and served by the
content mapper (`q50c`, `q500c`). `q500s` uses a cache generated for another schema, so every
entry is stale and must cost what no cache costs.

`thresholds.json` caps instantiations (30% headroom: they are deterministic), check time (2x:
it is noisy), errors, and the largest statement that must still infer; for the cache, the
instantiations of one hit (q500c − q50c over 450, at most 250) and a stale cache against no cache
(at most 1.05x). CI runs the bench as a separate job and writes the table to the job summary.

`run.mjs` also prints the marginal cost of one query, q500 minus q1 divided by 499: check
time per query, queries per second of check time, and instantiations per query. That is the
number to watch for an app with hundreds of typed queries.

Current numbers on TypeScript 7.1.0-beta:

| File | Instantiations | Check time |
|---|---|---|
| q1 | ~149K (mostly checking core's sources) | ~0.22 s |
| q50 | ~0.65M | ~0.50 s |
| q500 | ~4.7M | ~2.8 s |
| mixed50 | ~0.42M | ~0.43 s |
| maxlen (all probes pass, up to 8 KB) | ~6.6M | ~0.95 s |
| per query (q500 − q1) | ~9.2K | ~5 ms, ~190 queries/s |
| q1d / q50d / q500d | ~18K / ~0.52M / ~4.6M | ~0.04 / ~0.31 / ~2.6 s |
| q50c / q500c (type cache) | ~20K / ~0.12M | ~0.02 / ~0.13 s |
| per cache hit (q500c − q50c) | ~230 | |
| q500s (stale cache) | ~4.7M (1.01x q500d) | ~2.6 s |

Where a typical query's cost goes (q50, instantiations above loading the library): lexing
~30%, parsing ~35%, binding and typing ~13%, building the row and parameter types ~17%, the
call signature (`:name` / inline rewriting, checks) ~4%. Each statement is analysed on its own:
TypeScript caches type instantiations by their arguments, and two statements that share a
fragment or a subquery still differ in their text and token tuple, so nothing is reused
between them.

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
