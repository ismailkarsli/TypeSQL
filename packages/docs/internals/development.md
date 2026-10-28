# Development

This pnpm workspace contains core, driver adapters (`pg`, `postgres`), ORM schema packages
(`kysely`, `drizzle`, `prisma`), editor tooling (`language-server`, `vscode`), benchmarks and docs
under `packages/`. See [Type engine](../guide/type-engine.md) for design rules and
[Releasing](./releasing.md) for versioning and publishing.

```sh
pnpm install
pnpm typecheck                 # packages, docs and examples
pnpm test                      # runtime, type and driver conformance tests
pnpm build && pnpm smoke:dist   # build and import the output with plain Node
pnpm docs:dev                  # docs site with hot reload
```

`tsrs` is the default compiler and API package. Official `typescript` is available for manual
cross-checks, with no automatic fallback:

```sh
pnpm exec tsc -p packages/core/tsconfig.json --noEmit
pnpm test:types -- --typecheck.checker=tsc
```

## Definition of done

For engine changes and new features:

1. Add exact type assertions in `packages/*/test/**/*.test-d.ts` using `toEqualTypeOf`,
   including a negative case for every nullability rule. Assert the exact `SqlError` through
   `Validate`/`V`; reserve `@ts-expect-error` for argument-shape errors or error placement inside
   a call. Run `pnpm check:expect-error`.
2. Run `pnpm test:oracle` (`--regress --views` for engine changes) and `pnpm fuzz` with no new
   disagreements. Extend `packages/core/test/fuzz/gen.ts` to emit new syntax. Remove fixed
   baseline entries with `--update`; unrelated engine bugs need a reviewed baseline entry
   and a fix in a separate commit.
3. Run `pnpm coverage`; thresholds must not drop. `pnpm coverage:ratchet` tightens them.
4. Follow `AGENTS.md`: add a change intent for each affected published package (including
   user-facing VS Code changes), and run `pnpm check:intents`. After changing
   `packages/core/src` except `src/cache/` and `src/runtime/`, run `pnpm cache-version` and
   include the updated `CacheVersion`; CI checks it.

## Database setup

Conformance tests use `TYPESQL_PG_URL` when set, otherwise a temporary `postgres:18` Docker
container (`TYPESQL_PG_IMAGE` overrides the image). Use a disposable database: conformance tests
**drop and recreate `users`, `posts` and `settings`**. Without a database or Docker, DB suites
skip; set `TYPESQL_REQUIRE_DB=1` (as CI does) to fail instead.

Type oracles and the fuzzer use `TYPESQL_ORACLE_URL` or start their own temporary PostgreSQL
container. The oracle fails without either; `TYPESQL_ORACLE=skip` explicitly skips it.
The parse-tree rejection audit requires Docker.

## Conformance tests

`packages/core/test/conformance/corpus.ts` pairs SQL with expected column keys and runtime
value types, checked against inference and both `pg` and postgres.js. To add a case, keep the
SQL literal with `as const`, update both `schema` and `ConformanceDB` for new tables, and use
`ORDER BY`/`LIMIT` for a deterministic first row.

## PostgreSQL regression tests

`vendor/postgres` is a submodule pinned to a PostgreSQL release. **Never modify, reformat, add
or delete files inside it.** Disagreements belong in
`packages/core/test/pg-regress/baseline.json`.

```sh
pnpm pg-regress:setup          # sparse checkout of the pinned release
pnpm test:pg-regress           # separate from pnpm test
pnpm test:pg-regress join with # selected regression files
```

The runner (`packages/core/test/pg-regress/`) splits SQL according to psql's lexer and reads
outcomes from the echoed statements in `expected/*.out`. It distinguishes syntax errors from
errors after parsing, including errors inside function bodies. Statements with unresolved psql
variables or backslashes in nonstandard strings are skipped.

It compares acceptance and syntax-error tokens, and reports compiler crashes. Utility
statements accepted without detailed parsing are excluded from syntax comparisons. Matching
semantic rejections agree even when their messages differ.

The run fails on every disagreement or compiler crash, including entries already in the
baseline. It also fails on resolved baseline entries or a baseline for another submodule
commit. `--update` cannot bypass a current error. Use `pnpm test:pg-regress --update` **only to
remove resolved entries or after a PostgreSQL upgrade**; a new disagreement is a parser
regression to fix. Generated JSON is
single-line: inspect it with `jq` and review the runner's added/removed summary.

To upgrade PostgreSQL, run `pnpm pg-regress:setup <release-tag>`, rerun with `--update`, review
the results, and include the submodule pointer and baseline together.

## Parse trees

`pnpm test:pg-ast` compares canonical parse trees from TypeSQL and PostgreSQL's `libpg_query`
for regression and type-test statements. It catches precedence and structural differences
that acceptance tests miss. Deliberately omitted AST details are normalized on both sides;
see `packages/core/test/pg-ast/canon.ts` and `pg-canon.ts`.

```sh
pnpm test:pg-ast
pnpm test:pg-ast join joins.test-d.ts # selected regression / type-test files
pnpm test:pg-ast --update            # remove resolved baseline entries
```

TypeSQL rejections require evidence: official regression output must confirm a server rejection;
type-test rejections need reviewed fixtures in `packages/core/test/pg-ast/rejections.json` with
SQL, the exact TypeSQL error, minimal schema, and PostgreSQL SQLSTATE and message. The audit
runs fixtures in rolled-back transactions on an isolated Docker server whose pinned version
matches `vendor/postgres`.

Missing evidence, changed diagnostics, server acceptance, unexpected server errors and stale
fixtures fail even with `--update`, which never generates rejection evidence. Verify the setup
and server error before changing a fixture. The summary reports total, agreed and skipped
counts. Agreed includes verified rejections. Statements outside the AST comparison's scope,
unresolved psql variables, nonstandard strings, PostgreSQL raw-parser rejections and dynamic
template slots count as skipped. Nonzero tree differences and compiler crashes remain visible.

Every tree difference and compiler crash fails the run, including baselined entries and runs
with `--update`. Baselines track resolved entries and PostgreSQL versions; they do not exempt
current errors. The GitHub summary is marked as failed whenever an error is found.
Set `TYPESQL_PG_AST_DEBUG=<file>` to log both forms in full.

User-approved exclusions live in `packages/core/test/oracle/comparison-skips.ts`, matched by
comparison suite, regression group and exact statement hash. They count as skipped with a
reason; changes to the statement require another review. All other disagreements still fail.

## Type oracles

`packages/core/test/oracle/` compares inferred column names, column and parameter types, and
nullability with a live server. It checks type-test SQL and function overloads; optional passes
replay PostgreSQL's regression suite, compare sequential DDL effects with the catalog, and check
view nullability through the independent analysis in `packages/pg`.

```sh
pnpm test:oracle
pnpm test:oracle --regress --views            # required for engine changes
pnpm test:oracle --regress join              # replay through join, checking join only
pnpm test:oracle --regress --views --shard 2/4 # one CI shard
pnpm test:oracle --update                    # reconcile reviewed baselines
```

Disagreements are `unsound` (wrong names/types or NULL in a non-null column), `rejects`,
`accepts` or `crash`. The view pass also reports `imprecise` and `unsound-candidate`; the latter
is tracked separately, with WHERE/ON narrowing excluded from that comparison. Baselines in
`test/oracle/baselines/` fail on new or resolved entries. Follow the definition of done before
updating them.

Skips are reported with reasons, including replay outcomes that differ from official output
(`replay-diverged`). Set `TYPESQL_ORACLE_DEBUG=1` for disagreement/skip details and
`TYPESQL_ORACLE_REPLAY_CACHE=<file>` to reuse replay results when only the comparison changes.

## Fuzzer

`packages/core/test/fuzz/` runs its seed corpus, then generates SQL over NULL-heavy data. It
checks acceptance, column names/types and non-null claims against PostgreSQL, and shrinks
failures to minimal counterexamples.

```sh
pnpm fuzz                         # deterministic CI run against the baseline
pnpm fuzz --seed 42 --runs 50000 --report out.json
pnpm fuzz --replay statement.sql   # also accepts a JSON array of { sql, key }
pnpm fuzz --update                # remove resolved baseline entries
```

New failures need a fix or, for unrelated bugs, a reviewed baseline entry as described above.

## Coverage

`coverage-thresholds.json` limits uncovered lines, branches, functions and statements per
runtime file; unlisted files require full coverage.

```sh
pnpm coverage
pnpm coverage:ratchet # tighten allowances; never loosen them
```

Use `/* v8 ignore next */` only for unreachable defensive code, with a reason.

For exact SQL errors, follow this pattern (`pnpm check:expect-error` enforces it):

```ts
expectTypeOf<V<"SELECT nme FROM users">>()
  .toEqualTypeOf<SqlError<'column "nme" does not exist', 1>>();
```

## Editor tooling

`packages/language-server` owns completion scanning, schema inspection and TypeScript API
sessions; `packages/vscode` owns VS Code integration and the SQL highlighting grammar. Keep
`language-server/src/complete/schema.ts` in sync with core's schema representation.

```sh
pnpm --filter @typesql/language-server test
pnpm --filter @typesql/language-server build
pnpm --filter typesql test
pnpm --filter typesql run package # packages/vscode/typesql.vsix
```

Install the VSIX and reload VS Code, or use the built `language-server/dist/bin.js` with the
[Neovim configuration](../guide/neovim.md). Test in a project resolving `@typesql/core` from
`node_modules`; `examples/` uses a paths alias and will not work for this. The language server
requires TypeScript 7.1; `.vscode/settings.json` selects the workspace SDK. Check VS Code's
**TypeSQL** output channel for session errors.

## Playground links

Playground links embed files from `packages/docs/playground/`, identified by `playground:<name>`
comments in Markdown or frontmatter. After editing them, run `pnpm playground` to regenerate
links; `pnpm playground --check` checks freshness and compilation (lines marked `// error …`
must fail). Open the links after example changes or releases: checks use workspace sources,
while the Playground uses published packages and its own TypeScript version.

## Compile-time bench

The immutable `packages/bench/src/case1.ts` application fixture is shared by source, built,
cached, stale-cache and runtime benchmarks. **Do not edit it to improve results.**
The `case1p` row generates three modules from the same fixture, checks each of its 379 SQL
calls exactly once without a type cache, and measures tsrs running those modules in parallel.
The `case1` row continues to measure the original single file.

```sh
pnpm --filter @typesql/core build
pnpm bench                       # tsrs and tsc; fails on threshold breaches
pnpm bench --compiler tsrs       # or tsc
pnpm bench --calibrate           # rewrite thresholds after reviewing measurements
node packages/bench/runtime.ts
```

Thresholds cover instantiations, check time, errors and cache ratios. Timings are application
averages including schema and fragment checking. See [Performance](../guide/performance.md)
for measurements; the release workflow updates published results.

## Function catalog review

After a PostgreSQL upgrade, inspect live `pg_proc` overloads and missing catalog names:

```sh
TYPESQL_PG_URL=… node scripts/catalog-from-pg.ts [names…]
```

## System catalog slice

`packages/core/src/schema/pg-catalog.ts` is generated from a live server; relation selection
and function-column overrides live in `scripts/pg-catalog-from-pg.ts`. Table nullability uses
`attnotnull`; view nullability uses the analysis shared with `typesql introspect` in
`packages/pg/src/introspect/nullability.ts`.

```sh
TYPESQL_PG_URL=… node scripts/pg-catalog-from-pg.ts [--check]
```

Conformance tests check generated output on matching PostgreSQL major versions and driver
values on all versions. Introspection fixtures in `packages/pg/test/introspect/` can be
regenerated with `TYPESQL_UPDATE_FIXTURES=1`; review changes before accepting them.
