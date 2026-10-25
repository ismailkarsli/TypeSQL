# Development

The repository is a pnpm workspace: `packages/core` (`@typesql/core`), the driver adapters
`packages/pg` and `packages/postgres`, the ORM schema packages `packages/kysely`,
`packages/drizzle` and `packages/prisma`, the VS Code extension `packages/vscode`,
`packages/bench` and the docs site, `packages/docs`.

```sh
pnpm install
pnpm typecheck                 # tsc per package, including the docs and package examples
pnpm test                      # vitest: runtime tests, type tests, conformance against Postgres
pnpm coverage                  # the same with coverage; fails below the per-file thresholds
pnpm mutate:runtime --changed  # mutation testing of the changed runtime lines (StrykerJS)
pnpm check:expect-error        # type tests assert exact SqlErrors, not @ts-expect-error
pnpm build && pnpm smoke:dist  # build the packages, then import the built output with plain Node
pnpm pg-regress:setup          # check out PostgreSQL's regression tests (vendor/postgres)
pnpm test:pg-regress           # the parser against them; see PostgreSQL regression tests
pnpm test:pg-ast               # our parse trees against PostgreSQL's parser; see Parse trees
pnpm mutate:types --changed    # type-level mutation testing; see Type-level mutation testing
pnpm playground [--check]      # regenerate (or check) the TypeScript Playground links
pnpm cache-version [--check]   # update (or check) CacheVersion after changing core's types
pnpm docs:dev                  # the docs site, with hot reload
pnpm docs:deploy               # build the docs site and deploy it to typesql.karsli.net
pnpm change                    # record a change intent; see Releasing
```

Type tests live in `packages/*/test/**/*.test-d.ts` and use `expectTypeOf` and, for
argument-shape errors only, `// @ts-expect-error` (see [Coverage and mutation
testing](#coverage-and-mutation-testing)). The engine's design rules and the TypeScript limits they work around
are in [Type engine](../guide/type-engine.md). Versioning and publishing are in [Releasing](./releasing.md).

`CacheVersion` (`packages/core/src/engine/cache.ts`) is a hash of core's type-level sources: a
type cache entry made by another version is never used. After changing anything under
`packages/core/src` (except `src/cache/` and `src/runtime/`), run
`pnpm cache-version`; CI runs it with `--check`.

## Editor tooling

Core has no editor code. Everything that does not depend on one editor is in
`packages/language-server`; each editor's package holds only the glue for that editor:

| Package | What it holds |
|---|---|
| `language-server` (`@typesql/language-server`) | The completions, the API session they run on, and `typesql-language-server <pipe>`: the JSON-RPC server that Neovim's `vim.lsp` hook connects to TypeScript 7's API session. |
| `vscode` (`typesql`, private on npm) | `extension.ts`, which bundles `language-server`'s sources with esbuild, and the TextMate grammar that highlights SQL. |

Neovim needs no package of its own: [Neovim](../guide/neovim.md) shows the `vim.lsp` config and
the tree-sitter injection query to copy.

| Module | What it does |
|---|---|
| `language-server/src/complete/scan.ts` | The scanner: what may be typed at the cursor (relation, columns of which FROM items, nothing). |
| `language-server/src/complete/schema.ts` | Relations and columns of a `DB` type, read with the checker, columns only when asked for. It reads core's schema representation (`$view`, `$types`, `$functions`, a column's `type`): keep it in step when that changes. |
| `language-server/src/complete/call.ts` | The `sql()` / `tx()` / `sql.fragment()` / `sql.as()` literal at the cursor and its `DB` type. |
| `language-server/src/complete/complete.ts` | `completionsAt`: the items and the LSP ranges they replace. |
| `language-server/src/core.ts` | The project's `@typesql/core` directory, whose declarations mark core's `Sql` and `TransactionalSql`. |
| `language-server/src/session.ts` | The API session on the TypeScript 7 language server, and the client matching its version. |
| `language-server/src/server.ts` | The completion server: connects to the API session pipe, adds our items to completion responses. |
| `vscode/src/extension.ts` | The LSP middleware (TypeScript 7.1's extension API) or, on the TypeScript 7 extension 1.0, a completion provider of its own. |
| `vscode/syntaxes/sql-injection.tmLanguage.json` | The TextMate grammar injected into TypeScript and JavaScript that highlights SQL in `sql()` literals; `vscode/test/grammar.test.ts` tokenizes it with vscode-textmate on VS Code's own TypeScript grammar. |

```sh
pnpm --filter @typesql/language-server test   # scanner cases, completions, sessions and the server through tsc --lsp
pnpm --filter @typesql/language-server build  # dist/bin.js, for Neovim
pnpm --filter typesql test                    # the highlighting grammar
pnpm --filter typesql run package             # packages/vscode/typesql.vsix, bundled with esbuild
```

To try a change:

- **VS Code**: install `typesql.vsix` with **Extensions: Install from VSIX…** and reload the window.
- **Neovim**: pass `{"node", "/path/to/packages/language-server/dist/bin.js", res.pipe}` to `vim.lsp.rpc.start`.

Completions find the project's `@typesql/core` by resolving it from the edited file, so try them in
a project that has `@typesql/core` in `node_modules` (a workspace package such as `packages/pg`, or
a scratch project with `node_modules/@typesql/core` linked to `packages/core`), not in `examples/`,
which gets core through a tsconfig `paths` alias.

The language server must run TypeScript 7.1: version 1.0 of the TypeScript 7 extension bundles
7.0, whose API cannot read the editor's program. `.vscode/settings.json` sets `js/ts.tsdk.path`
to the workspace's `typescript`; VS Code asks once to allow it. The **TypeSQL** output channel
logs the API client the session picked and any error.

## Playground links

The README, the package READMEs and the docs site link to the TypeScript Playground. Each link
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
2. Otherwise `docker run -d --rm -e POSTGRES_PASSWORD=typesql -p 127.0.0.1:<free port>:5432 postgres:18`
   (override the image with `TYPESQL_PG_IMAGE=postgres:17`), wait until a TCP connection works,
   run, then `docker rm -fv` (with the container's volume).
3. If neither is possible the suite is skipped, not failed, and the run ends with one line naming
   the skipped files. With `TYPESQL_REQUIRE_DB=1` (set in CI) it fails instead.

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

1. `psql.ts` splits each `.sql` file into the statements psql sends, following psql's lexer
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
3. `run.ts` writes one `.ts` file per test to `node_modules/.cache/typesql-pg-regress/`, each
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
- `position`: both report a syntax error, at different tokens. Postgres's message names the token
  (`at or near "…"`, or `at end of input`), and so does ours (`at or near …`): the two must name
  the same one, compared case-insensitively. Skipped utility statements are not compared.
- `crash`: the compiler gave up on the statement (e.g. TS2589), whatever Postgres did.

`baseline.json` lists every current disagreement by file, kind and a hash of the statement text
(there are none today: see [Postgres compatibility](../guide/postgres-compatibility.md)),
with its line, a preview, Postgres's error and ours for reading. The run fails when a
disagreement is not listed (a regression: fix the parser) and when a listed one no longer occurs
(an improvement: run `--update` so the list only shrinks). It also fails when the baseline was
written for a different commit of `vendor/postgres`. Generated JSON (every baseline,
`coverage-thresholds.json`, the bench's `thresholds.json`, the fuzzer's `corpus/candidates.json`,
the reports) is written on one line: read it with `jq`, and review an `--update` by what the run
prints (the entries added and gone) rather than by its diff.

To move to a new PostgreSQL release:

```sh
pnpm pg-regress:setup REL_18_7    # fetch and check out the tag
pnpm test:pg-regress --update     # review what it prints: new statements, new disagreements
git add vendor/postgres packages/core/test/pg-regress/baseline.json
```

## Parse trees

pg-regress only checks *whether* a statement parses, and where a syntax error is. `pnpm test:pg-ast`
(`packages/core/test/pg-ast/`) checks *how*: every statement of the regression tests that
PostgreSQL's own parser accepts, and every statement of our type tests, is parsed by both
parsers and printed in one canonical, fully parenthesized form, then compared as text:

```text
SELECT v FROM c WHERE ((x = 1) OR (true AND (v IS NOT NULL)))
```

```sh
pnpm test:pg-ast                       # all of them, ~2–4 min, two TypeScript sessions, ~4 GB in all
pnpm test:pg-ast join joins.test-d.ts  # only these regression tests / type test files
pnpm test:pg-ast --update              # rewrite baseline.json (only the named ones' entries, if named)
```

- Postgres's side is [libpg_query](https://github.com/pganalyze/libpg_query) (`libpg-query`
  on npm, PostgreSQL 18's parser compiled to WASM, pinned as a dev dependency of core), printed
  by `pg-canon.ts` from its JSON tree.
- Ours is a type, `Canon<Q>` (`canon.ts`) over `ParseProgram<Lex<Q>>`, evaluated in batches of
  2000 statements by the type evaluator's probe programs (`src/cache/evaluate.ts`).
- The form covers expressions (precedence and associativity, AND/OR/NOT, IS, BETWEEN, IN, LIKE,
  ANY/ALL, casts, COLLATE, AT TIME ZONE, subscripts and fields, rows), FROM (joins, LATERAL,
  aliases), set operations with their ORDER BY / LIMIT, target lists, GROUP BY, windows, WITH,
  INSERT/UPDATE/DELETE/MERGE, cursors, and the DDL our AST keeps (CREATE TABLE columns and
  constraints, ALTER TABLE actions, DROP, views, enums, schemas, CREATE FUNCTION's result type).
  Everything else prints `…` on both sides and is counted as out of scope. `canon.ts` describes
  the form.
- What our AST deliberately drops or rewrites (sort directions, window frames, the ON CONFLICT
  target, SYMMETRIC, `x AT TIME ZONE z` as `timezone(z, x)`, …) is dropped or rewritten the same
  way on Postgres's side, each with a comment naming our parser rule.

A disagreement is `parse` (the forms differ) or `crash` (the compiler gave up on our form).
Statements our parser rejects are skipped (`pnpm test:pg-regress` covers acceptance), like those
with psql variables. `baseline.json` works like pg-regress's: keyed by regression test or type
test file, kind and statement hash, with both forms around the first difference; the run fails
on a new disagreement and on a listed one that went away, and when it was written for another
`vendor/postgres` commit. `TYPESQL_PG_AST_DEBUG=<file>` appends every disagreement with both
forms in full.

## Type oracles

pg-regress only checks that a statement parses. The oracles (`packages/core/test/oracle/`) check
what we infer against a live PostgreSQL 18: column names and types and parameter types against
what the server describes, and nullability against the rows it returns.

```sh
pnpm test:oracle                  # our type tests' statements (and the function catalog)
pnpm test:oracle --regress        # also PostgreSQL's regression suite replayed, and its DDL (~30 min)
pnpm test:oracle --regress join   # the replay up to `join`, checking `join` only
pnpm test:oracle --regress --views --shard 2/4   # the replay, checking the 2nd of 4 sets of tests (CI)
pnpm test:oracle --views          # also the view oracle (over --regress's statements too when given)
pnpm test:oracle                  # our type tests' statements and the function catalog
pnpm test:oracle --update         # rewrite the baselines in test/oracle/baselines/
```

The server is `TYPESQL_ORACLE_URL`, else a `postgres:18` container started for the run and
removed with its volume. Without either the run fails; `TYPESQL_ORACLE=skip` skips it.
`TYPESQL_ORACLE_DEBUG=1` prints every disagreement and skip with our printed analysis.

**Our type tests** (`types`): every statement the type cache discovers in `test/types` (as the
job does: `sql()` calls, `RowOf`/`Validate`/… types, migration steps) is evaluated with
`src/cache/evaluate.ts`. Its `DB` is written out as DDL (`schema.ts`) in a database of its own,
with one row of NULLs in every nullable column, rows of edge values (empty string, 0, -1,
extremes, `infinity`, empty array, JSON `{}`/`[]`/`null`), a duplicate row, and an empty pass
over the same tables. Each statement is described, then run in a transaction that is rolled
back: with the parameters we type nullable bound to NULL and with sample values, over the seeded
and the emptied tables. A migration step is run over the emptied tables and only its acceptance
is compared.

Types are compared after normalization only: arrays as `elem[]`, domains as their base type,
enums by name, typmods and schema qualifiers dropped, our `null` output column as `text`
(Postgres resolves unknown output columns to `text`). Columns of a `*` expansion are compared by
name (an object type has no column order), duplicate names collapsed the way the drivers do.

A disagreement is one of (`kinds.ts`):

- `unsound`: we say non-null and the server returned NULL, or a column name, column type or
  parameter type differs;
- `rejects`: we return an error for a statement the server accepts (and does not fail when it
  runs over the seeded rows);
- `accepts`: the server rejects the statement when describing it (an unknown column, a type
  mismatch, a constant that is not valid input) and we infer a type;
- `crash`: the compiler gave up (TS2589 and friends).

A statement that cannot be checked is counted as a skip with a reason (`{slot}` fragments, a
function the test declares by catalog augmentation, a role or a constraint a `DB` type cannot
express, a NOT NULL violation the seeded rows never reach). The baselines work like pg-regress's:
keyed by file, kind and statement hash; the run fails on a new disagreement and on a listed one
that went away. An `unsound` entry needs an `issue` (a number, or `"pending"` until it is
opened; `node scripts/issues.ts baseline <baseline.json…>` opens them and writes the numbers in).
A statement that makes the compiler fail or hang is found by splitting its batch (`batches.ts`)
and reported as `crash`.

**The function catalog** (`functions`, `functions.ts` and `calls.ts`): for every name in
`FunctionCatalog` and `PgFunctions`, every `pg_proc` overload (pg_catalog, and the extensions
the catalog types: pgcrypto, uuid-ossp, unaccent, pg_trgm, fuzzystrmatch) is called with
concrete arguments: polymorphic parameters as `int4`, `text` and `jsonb` (ranges as `int4range`,
`anyenum` as an enum of the run's own), a VARIADIC parameter with one and with two arguments,
defaulted parameters left out one by one. Each call is a statement in the forms its kind allows,
with one column per argument variant (sample values, other sample values, `NULL::t` in each
position):

- function: `SELECT f(…), …`; set-returning: `SELECT f(…)` and `SELECT * FROM f(…)`, one
  variant each (side by side they would be padded with NULLs);
- aggregate: over `(VALUES …) v(…)` grouped, ungrouped over no rows, and `OVER ()`;
  ordered-set and hypothetical-set: `f(direct) WITHIN GROUP (ORDER BY v.…)`;
- window function: `f(…) OVER ()`.

Each statement is described and compared like a type test's, then run in a rolled-back
transaction (a column alone when the whole fails; 2 s statement timeout) for the NULL checks; a
strict function's column with a NULL argument counts as NULL without running. Volatile functions
are only described unless `RUN_VOLATILE` lists them as harmless (`pg_sleep`, advisory locks,
`pg_terminate_backend`, large objects, … never run). The `pg_stat_get_backend_*` functions are
called with backend numbers no session has (-1, 2147483647): small ones name whichever sessions
are connected, and their NULLs would differ between servers. The catalog signature each overload resolves
to (our `PickSig`) must agree with `pg_proc` on aggregate, window and set-returning (an `unsound`
entry `flags of f(…)`), and a catalog signature no overload reaches gets calls of its own built
from its patterns (`coalesce`, `greatest`, `current_date`, `set_bit(varbit, …)`, …). The summary
counts names and signatures checked and skipped by reason; entries are grouped by function name.

**The regression suite** (`regress`, `ddl`; `--regress`): `parallel_schedule` replayed on a fresh
`regression` database of the server, as pg_regress runs it (its session settings, one connection
per test file, `test_setup` COPYing `src/test/regress/data` from the server's `/regress` mount,
which `pnpm pg-regress:setup` checks out). COPY FROM STDIN data is fed through `COPY … FROM
PROGRAM` (the driver loses errors in the COPY protocol). A statement whose live outcome differs
from its `.out` (it needs `regress.so`, which the stock image lacks, or depends on one that did) is
the skip `replay-diverged`. Every query (SELECT, VALUES, TABLE, WITH, DML, a DECLARE's query, a
PREPARE's body with its parameter types made explicit) is described before it runs and compared
like ours, over a `DB` introspected from the catalog at that point with packages/pg's introspection
(restricted to the names the statement mentions, along the session's search path, with
`PgCatalog`, and the user functions it calls as `$functions`). The DDL is applied with `ApplyDdl`
step after step: a test file's DDL statements that ran on the server form a chain, from the
catalog as it was at the file's first one (restarted after a ROLLBACK, which discards the
server's steps), each applied to our own result of the step before; after every step our schema
is compared with the catalog (relations, columns by name, types, NOT NULL, defaults), so a
difference stays visible in the steps that follow it. The summary counts `rejects` by cause
(unknown function, type, …).
`TYPESQL_ORACLE_REPLAY_CACHE=<file>` keeps the replay's results for reruns that only change the
comparison.

**The view oracle** (`views-types`, `views-regress`; `--views`): each SELECT without parameters
becomes `CREATE TEMP VIEW` (rolled back) and packages/pg's `ViewNullability` analyses its query
tree, a separate implementation of nullability. The view proving NOT NULL where we say nullable is
`imprecise`; we say non-null where the view says nullable is `unsound-candidate` (needs an issue),
unless the statement has a WHERE or ON condition, which our narrowing may use and the view
analysis ignores (counted as `narrowed columns`).

## Fuzzer

```sh
pnpm fuzz                          # the CI run: seed 1, 2000 statements, against test/fuzz/baseline.json
pnpm fuzz --update                 # rewrite the baseline
pnpm fuzz --seed 42 --runs 50000 --report out.json   # the nightly run: any failure fails, 5 are shrunk
pnpm fuzz --replay statement.sql   # check one statement (or a JSON array of { sql, key })
```

`packages/core/test/fuzz/` generates statements (`gen.ts`, fast-check arbitraries, so failures
shrink) over a NULL-heavy schema (`schema.ts`): outer joins with USING and NATURAL, predicates
that narrow, CASE, COALESCE/NULLIF/GREATEST, aggregates with FILTER, GROUPING SETS/ROLLUP/CUBE,
window functions and frames, scalar/EXISTS/IN subqueries (correlated), CTEs (recursive too), set
operations, LATERAL, `$n` parameters, RETURNING and the JSON builders. The seed corpus
(`corpus/*.sql`) runs first. Each statement is evaluated (in batches of 500), described and run
like the oracles', and checked for: Postgres accepts it ⇒ we do not reject it; names and types
equal the description; no NULL in a column we type non-null; Postgres rejects it ⇒ we reject it.
A failure is shrunk to a minimal statement failing the same property; its signature is the
property and the sorted node kinds. The run prints how many nullable output columns returned a
NULL (a low ratio means the data or the predicates need work).

`node scripts/issues.ts fuzz --report out.json` opens an issue per new signature (label `fuzz`,
at most 5 per run; a known signature gets a comment when its counterexample is shorter), and
`issues.ts fuzz-open --out open.json` exports the open issues' statements for `pnpm fuzz
--replay open.json`, after which `issues.ts fuzz` comments on those that no longer fail.
`--dry-run` prints the issues instead.

## Definition of done

A contributor or an agent can change the engine or add a feature freely; CI says when the change
is not pinned down by tests. A change is done when:

1. **Type tests** assert exactly (`toEqualTypeOf`, and `Validate`/`V` with the exact `SqlError`,
   not `@ts-expect-error`, for statements; `pnpm check:expect-error` checks this), for what
   changes and for what must not: a negative case for every nullability rule.
2. **No new `unsound` disagreement** with PostgreSQL: `pnpm test:oracle` (with `--regress
   --views` when the engine changed; CI decides that from the diff), and the fuzzer's generator
   (`test/fuzz/gen.ts`) emits the new syntax, with `pnpm fuzz` green. A baseline only shrinks:
   a fixed disagreement is removed with `--update`; a new one is a bug to fix (or, when it is
   not the change's, an entry with an issue).
3. **Changed-lines mutation testing** passes: `pnpm mutate:types --changed` for type-level code
   and `pnpm mutate:runtime --changed` for runtime code. A surviving mutant needs a test, or
   `// type-mutate: equivalent – <reason>` / `// Stryker disable next-line <mutator>: <reason>`
   when no test can tell it apart.
4. **Coverage thresholds** do not drop (`pnpm coverage`; `pnpm coverage:ratchet` raises them).
5. **The change intent and `CacheVersion`**, as in AGENTS.md.

With all of this in CI, a green run says that every new line is pinned by some test and that the
engine agrees with PostgreSQL on every statement the oracles can replay.

## Type-level mutation testing

No coverage tool sees inside conditional types, so mutation testing is the coverage measure for
`packages/core/src/engine`, `schema` and `type-map`: `scripts/type-mutate.ts` changes one type
at a time and checks that some type test fails. The generated function table
(`engine/typer/pg-functions.ts`) is skipped: its entries are copied from `pg_proc` and checked by
the oracles, so a test per entry would only restate it (`--mutate <path>` still reaches it). A
curated table the oracles check the same way is skipped with a comment on the line before its
declaration, `// type-mutate: table – <reason>` (`FunctionCatalog` in `typer/catalog.ts`).

```sh
pnpm mutate:types --changed                  # mutants on lines changed since the base; survivors fail
                                             # (mutants marked equivalent are not checked; --check-equivalent checks them)
pnpm mutate:types --files narrow.ts          # every mutant of a file (a glob, or a path suffix)
pnpm mutate:types --sites narrow.ts:60-70    # mutants on those lines
pnpm mutate:types --list --sites expr.ts:71  # print the mutants, check nothing
pnpm mutate:types --shard 3/16 --report r.json --summary r.md   # one shard of a full run
node scripts/type-mutate.ts merge --report all.json --summary all.md r-*.json
pnpm mutate:types --files narrow.ts --compiler tsrs              # check with tsrs instead of TypeScript
pnpm mutate:types --files narrow.ts --profile                    # where each mutant's check spent its time
```

The mutators (`scripts/type-mutate/sites.ts`), found with the TypeScript AST:

| Mutator | Mutant |
|---|---|
| `cond-swap` | the branches of a conditional type swapped |
| `cond-true`, `cond-false` | its test always / never taken: one branch in both places (not `cond-true`, nor `never-false`, when the test always matches: `X extends infer S` without a constraint, `X extends unknown`, `X extends any`) |
| `never-true`, `never-false` | a branch replaced with `never` |
| `bool-flip` | `true` ↔ `false` |
| `union-drop` | one member of a union of string literals dropped |
| `tuple-swap` | two adjacent tuple members of the same kind swapped |
| `sibling-swap` | the numbers of two sibling branches of a conditional chain swapped (binding powers: `W extends "and" ? … 2 … 3 : W extends "or" ? … 1 … 2`) |
| `infer-bare` | `infer X extends C` → `infer X` |

One TypeScript session loads `packages/core/tsconfig.json` (sources and tests). Per mutant, the
mutated file is overlaid in memory (no `tsc`, no vitest) and the test files under
`packages/core/test` are checked one at a time until one has an error: the mutant is
**killed**. A mutant every test file accepts **survived**; one whose own file, or another
source file, no longer compiles is **invalid** and does not count. Test files are tried in
kill-map order: the file that killed the mutant last time, then the files that killed most
mutants of the same source file. The kill map is
`node_modules/.cache/typesql-type-mutate/kill-map.json` (`--kill-map`); without one the type tests
go first, alphabetically, and the run learns as it goes.

`--changed` diffs against `BASE` (CI: the PR base, or the push's previous commit), else
`git merge-base main HEAD`, uncommitted and untracked files included. A mutant is on a changed
line when its anchor is: the `C extends X` of a conditional (and a leaf branch it replaces), the
literal, the union member or the tuple members. A survivor fails the run unless one of those
lines says why no test can tell the difference:

```ts
  : K extends Skip ? false // type-mutate: equivalent – <reason>
  : K extends Skip ? false // type-mutate: equivalent never-true – <reason>, for that mutator only
```

`--report` writes every mutant as JSON (file, line, column, mutator, original and mutated text,
status, the test file that killed it, and for an invalid one the compiler error);
`--summary` writes markdown with the survivors per file, and `GITHUB_STEP_SUMMARY` gets it too.
A killed mutant costs about a second with a kill map; a survivor costs a check of every test
file (15–30 s). A full run (about 23 000 mutants, a quarter of them surviving) is sharded
(`--shard i/n` takes every n-th mutant), and `merge` joins the shards' reports and rebuilds the
kill map from them.

`--compiler tsrs` checks with [tsrs](https://github.com/oxc-project/tsrs), a Rust port of
TypeScript 7 with the same API (`tsrs/unstable/*`), installed as a dev dependency. It finds the
same mutants and, on a sample of 12, gave every one the same status at about 2.7× the speed
and a third of the memory; TypeScript stays the default, because tsrs follows a TypeScript 7.1
dev build rather than the version the project uses. `TYPE_MUTATE_COMPILER=tsrs pnpm vitest run
scripts/type-mutate` runs the script's own tests on it.

`--profile` adds `profile` to the report: per mutant, the time of the snapshot update, of the
mutated file, of each test file and of the other source files, and the time of the clean check.
The run ends with the shares and the slowest test files. On a sample, the type tests took 95% of
the time and the runtime tests 3%.

The API checks the files of a `getSemanticDiagnostics` call one after another on one checker per
program, so a call for several files is no faster; running several snapshots of one mutant side
by side made no difference on a sample (one survivor, a busy machine).

## Coverage and mutation testing

A green run should mean that every changed line is pinned by a test that fails when the line is
wrong. Coverage and mutation testing check that for runtime code (`packages/*/src` without
core's `engine`, `schema` and `type-map`, which are types only; the list is
`scripts/coverage-files.ts`), and the type tests must name the exact errors they expect:

```sh
pnpm coverage                          # vitest run --coverage (v8); needs Postgres for the DB suites
pnpm coverage:ratchet                  # lower the thresholds to what a run measures
TYPESQL_PG_URL=… pnpm mutate:runtime --changed [--base <rev>]
TYPESQL_PG_URL=… pnpm mutate:runtime [files…]   # everything: the score per package and file
pnpm check:expect-error
```

**Coverage.** `coverage-thresholds.json` holds, per file, the most uncovered lines, branches,
functions and statements it may have; a file not listed must be fully covered, so new code comes
with tests. `pnpm coverage` fails when a file has more. `pnpm coverage:ratchet` runs the suite
(with `TYPESQL_REQUIRE_DB=1`) and lowers the allowances to the measured counts, never raises
them; `--no-run` reads the last run's `coverage/coverage-summary.json`, `--reset` writes the
measured counts as they are (only for a reviewed reset). The goal is 100% lines and branches;
`/* v8 ignore next */` is only for defensive code that cannot run, with a comment saying why.

**Mutation testing.** StrykerJS (`stryker.config.ts`) changes one operator, condition, literal
or block at a time and runs the tests that cover it; a mutant no test kills marks a line no
test pins down. `--changed` mutates the lines changed since the merge base of `--base` (default
`$BASE`, else `main`), uncommitted and untracked files included, and fails on any mutant that
survives or that no test reaches. A mutant that cannot change behaviour (an equivalent mutant)
gets a comment on the line above, and the reason is required:

```ts
// Stryker disable next-line ConditionalExpression: <why no input can tell the mutant apart>
```

Stryker runs `vitest.stryker.config.ts`: the runtime test projects, without the type tests
(they run no runtime code). It mutates the sources in place (a sandbox copy would keep the pnpm
workspace links pointing at the real sources), so do not edit while it runs; an interrupted run
restores them from `.stryker-tmp/`. Every worker gets its own database, `typesql_stryker_<n>`
on `TYPESQL_PG_URL`. Code that only runs in a child process (the type cache's builds through
`tsc`) is not reached and reports as without coverage. Reports go to `reports/mutation/`:
`mutation.html` and `mutation.json` from Stryker, and for a full run `summary.json` and
`summary.md` (the score per package and per file, also written to the GitHub job summary).
`--no-run` judges the last report again.

A full run takes hours (about 5.5 h with two workers locally: the static mutants, in code that
runs when a module loads, run the whole suite each), so the weekly job (`stryker.yml`) splits it
and reuses the last run's results:

```sh
pnpm mutate:runtime --shard 2/4       # the 2nd of 4 sets of files (balanced by size)
pnpm mutate:runtime --incremental     # test only mutants whose code or covering tests changed
pnpm mutate:runtime --incremental --force   # test every mutant, and record the results
pnpm mutate:runtime --merge shards/*  # one report from the shards' reports/ directories
```

`--incremental` is StrykerJS's incremental mode over `reports/stryker-incremental.json`: a
mutant's last result is reused unless its code or the tests that covered or killed it changed.
It does not notice changes to code the tests call that is not mutated, or to dependencies, so the
weekly job forces a full run on the first Sunday of the month (and by hand with `force`), and
starts from scratch when `pnpm-lock.yaml` or the Stryker configuration changed. The shards run in
parallel and incrementally from the last successful run's `stryker-incremental` artifact; the
`report` job merges them into one score and the results the next run starts from.

**Exact errors in type tests.** `@ts-expect-error` passes on any error, so a test that a statement
is invalid passes whatever the error is. `pnpm check:expect-error` fails on a `@ts-expect-error`
whose next statement is a `Row`/`RowOf` assertion or a `sql()` call of a statement without
parameters, and on an `SqlError<string, …>`. Assert the exact error instead:

```ts
expectTypeOf<V<"SELECT nme FROM users">>().toEqualTypeOf<SqlError<'column "nme" does not exist', 1>>();
// through an adapter's sql function: the query parameter carries the error
expectTypeOf<Parameters<typeof sql<"SELECT nope FROM users">>[0]>()
  .toEqualTypeOf<SqlError<'column "nope" does not exist', 1> & "SELECT nope FROM users">();
```

`@ts-expect-error` stays for argument-shape errors (a wrong parameter value or object, a missing
argument, a slot or an inline value) and inside a call, where it pins where the error lands.

## Compile-time bench

`packages/bench` measures what the engine costs the compiler:

```sh
node packages/bench/gen.ts              # writes src/q1.ts, q50.ts, q500.ts, mixed50.ts, maxlen.ts
pnpm --filter @typesql/core build        # the …d and …c variants use the built package
node packages/bench/run.ts              # tsc --extendedDiagnostics per variant; exit 1 on a threshold breach
node packages/bench/run.ts --calibrate  # rewrite thresholds.json from the measured numbers
```

`qN.ts` holds N distinct realistic SELECTs; `mixed50.ts` holds 50 statements that use inline
`${sql.param()}` values, `:name` parameters, one `{slot}` fragment shared by many statements
and `sql.id`; `maxlen.ts` holds one statement per size probe (0.5, 1, 2, 4 and 8 KB).
Each file is measured in up to three ways: against core's TypeScript sources (`q1` … `maxlen`),
against the built package with `skipLibCheck`, as an application compiles (`q1d`, `q50d`,
`q500d`), and with a [type cache](../guide/performance.md) generated for the file and served by the
content mapper (`q50c`, `q500c`). `q500s` uses a cache generated for another schema, so every
entry is stale and must cost what no cache costs.

`thresholds.json` caps instantiations (30% headroom: they are deterministic), check time (2x:
it is noisy), errors, and the largest statement that must still infer; for the cache, the
instantiations of one hit (q500c − q50c over 450, at most 250) and a stale cache against no cache
(at most 1.05x). CI runs the bench as a separate job and writes the table to the job summary.

`run.ts` also prints the marginal cost of one query, q500 minus q1 divided by 499: check
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

`scripts/catalog-from-pg.ts` prints every `pg_proc` overload of each function in the catalog
(argument and return types, strict / aggregate / window / set-returning flags) and lists
catalog names Postgres does not have, for a manual diff after a Postgres upgrade:

```sh
TYPESQL_PG_URL=postgres://postgres:x@localhost:5432/postgres node scripts/catalog-from-pg.ts [names…]
```

## System catalog slice

`packages/core/src/schema/pg-catalog.ts` (`PgCatalog`) is generated from a live server. The
relation list is `RELATIONS` in `scripts/pg-catalog-from-pg.ts`. Column types come from
`pg_attribute`, with domains replaced by their base type. Table columns are `NOT NULL` when
`attnotnull` is set. View columns are `NOT NULL` only when the view's query tree
(`pg_rewrite.ev_action`) proves it. Set-returning function columns are nullable unless they
are in `FUNCTION_COLUMNS_NOT_NULL`.

```sh
TYPESQL_PG_URL=postgres://postgres:x@localhost:5432/postgres node scripts/pg-catalog-from-pg.ts [--check]
```

The view analysis lives in `packages/pg/src/introspect/nullability.ts`, shared with
`typesql introspect`; its end-to-end test (`packages/pg/test/introspect/`) compares the output
for a fixture database with `schema.generated.ts` (`TYPESQL_UPDATE_FIXTURES=1` rewrites it) and
type-checks queries against that file.

`packages/core/test/conformance/pg-catalog.test.ts` regenerates the file and compares it when the
server's major version matches the file's. On any version it selects every relation through
both drivers and checks the column order, that `NOT NULL` columns hold no NULLs, and the
`typeof` of every value.
