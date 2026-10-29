# Tracked schema migrations plan

Status: complete. The core entry point, typed migration contexts, tracked runner, CLI commands, configuration, generation, and documentation are implemented and verified. Final repository checks are recorded below.

## Settled decisions

### Packages and public API

- Add a tree-shakeable `@typesql/core/migration` entry point and migration commands to `@typesql/cli`.
- Support PostgreSQL and SQLite.
- Expose standalone `migrateUp`, `migrateDown`, and `migrateLatest` functions from core rather than a `Migrator` class.
- `@typesql/core/migration` owns programmatic migration file loading/discovery and execution; the CLI calls these core functions.
- Use **minor** change intents for both `@typesql/core` and `@typesql/cli`.

### Migration files and types

- Read TypeScript migration files from a migrations directory. Use Node 26's built-in TypeScript support to load both migrations and config.
- Each file exports `up` and `down` functions. `down` is mandatory and may have an empty body.
- Each migration file declares its dialect in the function parameter type: `function up(db: PostgresMigration<Base>)` or `function up(db: SqliteMigration<Base>)`, with a corresponding `down` function. Do not use a dialect-aware `defineMigration` wrapper or a dialect helper exported from config.
- Config also declares a dialect to select the runtime database connection. The CLI does not inspect migration parameter types or reject a dialect mismatch at runtime; those types are erased by TypeScript.
- The migration context executes asynchronously. `mig.add(DDL)` checks DDL and returns a context whose type reflects the changed schema. Calling `mig("SELECT ...")` or other non-DDL SQL yields TypeSQL's checked query with inferred rows. Support all SQL syntax through these two paths.
- Provide `.raw<NewSchema>(sql)` as an escape hatch for dynamic or unsupported SQL, following the existing migrations builder's explicit schema assertion pattern.
- Preserve the evolving schema type by chaining or assigning each result to a new `const`. Reassigning `mig = mig.add(...)` is not a supported way to carry the new type.
- `up` returns its final typed migration context so the next file can import the previous `up` type and infer its resulting schema. Avoid exported `Before` and `After` aliases in generated files; use the previous `up` and a schema-extraction type directly.
- Allow the first migration to declare an existing starting schema type in its `PostgresMigration<Base>` or `SqliteMigration<Base>` parameter rather than requiring an empty database.
- `down` may execute any migration logic. Do not require its resulting schema to match the schema preceding `up`.
- An empty `down` still counts as a successful down migration and removes its applied-migration record.

### CLI and configuration

- Use `typesql migrate up`, `typesql migrate down`, and `typesql migrate latest`. `up` and `down` run one migration each; `latest` runs every pending migration.
- Add `typesql migrate make` to generate a new TypeScript file with the predecessor type link.
- Require a name for `typesql migrate make`. Generate `<unix-seconds>_<name>.ts` and report an error if that filename already exists. Convert spaces to dashes, preserve other valid filename characters, and reject path separators or control characters. Also error if the generated filename would sort before an existing `.ts` file.
- Automatically load `typesql.config.ts` in the working directory, with `--config` selecting another config file.
- Config supports `{ dialect, url?, db?, migrationsDir? }`. Support both config and CLI flags: `--dialect`, `--url`, `--db`, and `--dir` override config. PostgreSQL falls back to `DATABASE_URL` if no URL is supplied.
- The default migrations directory is `./migrations` beside `typesql.config.ts`. `--dir` overrides the configured directory.
- When no config file exists, complete CLI flags are sufficient; in that case the default `./migrations` directory is relative to the working directory.
- Read every `.ts` file in the migrations directory in filename order; do not require timestamp-prefixed names for manually added files.

### Applied migration tracking and execution

- Use a `schema_migrations` table by default, with a `migrationTable` config override. Its complete set of columns is `name` (primary key), `hash`, and `applied_at`.
- Store a SHA-256 hash of normalized runtime code, not exact source bytes or type-only syntax. Reject an applied file whose current normalized hash differs from the stored hash. Ignore whitespace and comments, but preserve the spelling of runtime tokens (so changing `'x'` to `"x"` changes the hash). The CLI may depend on TypeScript at runtime to parse or tokenize the source.
- Create the PostgreSQL tracking table in the connection's current schema.
- Stop with an error if an applied file is missing or a newly discovered file sorts before an already applied file.
- Run each migration and its tracking-table change in its own transaction. During `latest`, successfully committed earlier files remain applied if a later file fails.
- Hold a PostgreSQL session-level advisory lock for the whole CLI migration command. On SQLite, use `BEGIN IMMEDIATE` and re-read migration history inside each file's transaction, so concurrent commands cannot apply the same file. Separate SQLite `latest` commands may interleave between files; whole-command SQLite exclusivity is not required.
- When `up` has no pending migration or `down` has no applied migration, succeed without changing anything.
- Fail when a migration contains SQL that cannot run inside its per-file transaction; do not provide a transaction opt-out.

## Resolved implementation decisions

- `PostgresMigration<Base = {}>` and `SqliteMigration<Base = {}>` are callable checked SQL contexts. `await db.add(ddl)` and `await db.raw<NewSchema>(sql)` return new contexts. Queries use the existing `.execute()` family and support parameters, fragments, and prepared queries. `MigrationSchema<typeof previousUp>` extracts the schema from an async function's returned context. A no-op `up` returns `db`; `down` can return `void`.
- Core runner options are `{ dialect, migrationsDir, execute, migrationTable? }`, with the existing TypeSQL `Executor` bound to a dedicated database connection. Results contain `{ direction, migrations }`, listing committed filenames. PostgreSQL uses a session advisory lock keyed by database, current schema, and table; SQLite rereads history after `BEGIN IMMEDIATE` for every file. An empty command rolls back tracking-table initialization, so it creates no table.
- Both tracking tables use `name TEXT PRIMARY KEY NOT NULL` and `hash TEXT NOT NULL`. PostgreSQL uses `applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`; SQLite uses `applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`.
- Hashing first uses Node's native TypeScript stripping, then the installed TypeScript 7 native parser API. SHA-256 covers syntax-tree boundaries, named syntax kinds, and exact runtime token spelling. Comments (including JSDoc), formatting, and erased types do not affect it; automatic semicolon insertion, literal contents, and quote spelling do. Only the migration file itself is hashed; imported runtime helpers are not recursively hashed.
- CLI output uses `typesql migrate: applied <name>`, `reverted <name>`, `created <path>`, `no pending migrations`, or `no applied migrations`. Success and empty operations exit 0; operational/configuration errors exit 1; invalid command syntax exits 2.
- Migration SQL cannot commit, roll back, or replace the runner's transaction. Savepoints, rollback to a savepoint, and release are supported. Database operations must be awaited; a context cannot start new operations after its migration finishes. SQL that the database disallows inside transactions fails normally and rolls back its file.

## Implementation and verification

- Added the isolated `@typesql/core/migration` export without changing existing untracked builders or adapters.
- Added CLI config/flag resolution, PostgreSQL and SQLite connections, four migration commands, and predecessor-linked TypeScript generation.
- Updated the core/CLI READMEs and migration guide, and added the approved minor intents for core and CLI.
- Extended the existing built-package smoke checks with real SQLite operations, concurrent subprocesses, history integrity, hashing, rollback, config and generation checks. Optional `TYPESQL_MIGRATION_POSTGRES_URL` enables PostgreSQL session-lock, schema, and transaction checks; these were exercised against disposable PostgreSQL 18 containers.
- Added seven PostgreSQL-derived oracle inputs covering a migration DDL/query workflow, including nullable and non-nullable columns. No new test suites or static type assertion suites were added.
- Verification passed: `pnpm check:intents`, `pnpm cache-version --check`, `pnpm test:pg-regress`, `pnpm test:pg-ast`, `pnpm fuzz`, `pnpm build && pnpm smoke:dist`, `pnpm typecheck`, `pnpm test:sqlite`, and `pnpm docs:build`. The PostgreSQL-enabled migration smoke checks also passed.
- Oracle verification: `pnpm test:oracle --regress --views` passed its full regression/DDL/view replay and function-catalog stages. Its corpus stage completed the comparisons but failed during cleanup because the native TypeScript compiler connection had closed. An isolated retry with `TYPESQL_ORACLE_PARTS=types,views pnpm exec vitest run --config packages/core/vitest.config.ts --mode oracle --silent=false` passed, covering the remaining corpus and view baselines. The cause of the original compiler disconnect was not established. No engine baseline was changed.

## Problems addressed

- The previous builder did not discover files, track applied migrations, verify integrity, or serialize concurrent commands. The new entry point and CLI supply those capabilities while retaining the existing builder.
- TypeScript 7 no longer exposes the legacy parser API. Hashing uses its native parser API and Node's native type stripping, preserving behavior-significant syntax.
- SQLite named parameters and multi-statement scripts needed explicit driver handling. Executor count callbacks also needed preservation so checked queries retain `.executeCount()` support.
- Empty commands initially created tracking tables; initialization now rolls back when there is no migration to run. Transaction-ending SQL is rejected, while nested savepoints remain usable.
- PostgreSQL truncates overlong identifiers, which could make distinct advisory-lock keys refer to one table. The runner checks the server's identifier byte limit before acquiring a lock.
- Generated `down` functions infer the schema returned by their own `up`, including the first file.

## Repository requirements for implementation

- Follow `AGENTS.md`: add the required change intent, run `pnpm cache-version` after changing `packages/core/src`, and commit the resulting `CacheVersion` when required.
- Run `pnpm check:intents`, `pnpm test:pg-regress`, `pnpm test:pg-ast`, `pnpm test:oracle --regress --views`, `pnpm fuzz`, and `pnpm build && pnpm smoke:dist` for the new feature. Follow the repository's oracle corpus and test-suite rules.
- Do not release, publish, tag, or edit the release ledger or changelogs as part of this work.
