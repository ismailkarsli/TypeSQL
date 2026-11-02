# Consumer tests

Use Docker Engine with Compose v2+, Node 26, and pnpm 12.11.2 on the host. Docker must be able to execute `linux/amd64` images (natively or through emulation). The container pins Node 26.8.1, pnpm 12.11.2, Bun 1.4.3, and PostgreSQL 18.6 by image digest. Compiler, driver, and ORM versions live in the test workspace catalog and its committed lockfile. The first run needs network access for those immutable downloads.

```sh
pnpm install --frozen-lockfile
pnpm test:consumer
pnpm test:consumer pg-left-join
pnpm test:consumer --no-file-parallelism
pnpm test:consumer pg-left-join --update
```

Arguments go directly to Vitest: positional filters select scenario paths, `-t` selects test names, and `--update` explicitly changes snapshots. Ordinary runs reject missing and changed snapshots, including outside CI. CI runs every scenario and prohibits snapshot updates. `pnpm test` runs the same complete consumer suite.

Each invocation builds the execution image, starts a private PostgreSQL service, builds and packs the eight library/CLI packages once, and runs Vitest. A unique Compose project and fresh databases isolate simultaneous invocations. SQLite applications receive their own `SQLITE_PATH`. PostgreSQL applications receive a fresh `DATABASE_URL`, with UTF-8, C collation, UTC, and ISO dates. Commands have timeouts; process groups are killed on timeout. Compose cleanup runs on success, failure, and interruption.

## Author a scenario

Normally add `package.json`, `app.ts`, and `expected.snap` under `tests/scenarios/<name>/`. Use an ordinary private ESM package. Declare every external dependency as `catalog:` and every checkout dependency as `workspace:*`. Add exact external versions to `tests/pnpm-workspace.yaml` when necessary, then update the one authoring lockfile:

```sh
pnpm --dir tests install
```

The authoring workspace deliberately omits checkout dependencies through `.pnpmfile.cjs`. Its `node_modules` is for resolving external versions; do not execute consumers there. No registry TypeSQL or source workspace package participates in this install.

Package scripts define a fixed lifecycle:

1. `setup`, if present, prepares database data or ordinary application inputs.
2. `generate`, if present, runs installed generators or CLI commands.
3. `compile`, required, runs the installed `tsc` and emits application JavaScript.
4. `start`, if present, executes that compiled application, only after successful compilation.

Default compilation is `tsc -p tsconfig.json --pretty false`; Node applications normally start with `node dist/app.js`. Bun uses `bun dist/app.js`. The runner copies the shared compiler defaults; an optional scenario `tsconfig.json` can override options without inheriting repository configuration or path aliases. `app.ts` must be a module. Export the inferred values or type aliases whose public types matter. Avoid annotating query results to force their intended type. Print database results in a stable order, using `console.dir(value, { depth: null })` for nested objects so their contents remain visible. Preserve driver values such as Date, bigint, Buffer, and null.

The optional `consumer` manifest field has three settings:

```json
{
  "consumer": {
    "database": "postgres",
    "artifacts": ["schema.ts"],
    "failure": { "stage": "compile", "exitCode": 1 }
  }
}
```

`database` is `postgres` or `sqlite`; omit it when neither is needed. `artifacts` lists generated text files to snapshot in full. `failure` explicitly expects a nonzero exit from `generate`, `compile`, or `start`. It is optional and is not a command sequence. A `generate` rejection ends the lifecycle; a compiler rejection never starts the application. Expected runtime exceptions must reach Node's exception monitor; command launch failures or timeouts cannot satisfy them. Caught errors can instead be printed by ordinary application error handling, as in the transaction and migration scenarios.

Vitest compares command status/output, every compiler diagnostic (including code, message, location, and expression), expanded public types, application exceptions, and listed artifacts. The observer uses `typescript/sync` from the consumer's own pinned compiler. It expands application aliases and preserves optional/readonly fields, nullability, literal unions, and tuple structure; `any`, `unknown`, and `never` remain visible. Recursive observed types currently stop with an explicit observer error instead of being truncated. The calibration scenario `observation-shapes` records these distinctions.

The configuration materializes tiny Vitest discovery files in ignored `tests/.vitest/`, one per scenario. These call the shared test; scenario authors write no test implementation. Vitest's supported `resolveSnapshotPath` places each snapshot beside its application. Generated discovery files are discarded on each run.

## Installation boundary

The runner selects the scenario's importer from the committed test lockfile and walks its external dependency closure. It converts catalog specifiers to exact catalog versions, preserving external package integrity and dependency edges. It supplies overrides for **all** TypeSQL packages, covering transitive dependencies, using freshly packed checkout tarballs copied into the isolated project. A lockfile-only **offline** install adds their current integrity. Every resulting external package and dependency edge must still match the committed lock; then a frozen install installs the consumer.

The test workspace and the isolated workspace both disable automatic peer installation, workspace-root peer resolution, peer-dependent deduplication, hoisting, and workspace linking. Peer deduplication otherwise merges optional ORM peers across neighboring scenarios. pnpm 12's lockfile contains multiple YAML documents; derivation reads the dependency document, independently of the package-manager document. Candidate integrity is generated anew even when package versions have not changed.

Consumers live under `/tmp`, outside `/checkout`. The runner checks installed candidate bytes against their tarballs, direct and transitive resolutions, package versions, lockfile tarball integrity, and the absence of undeclared repository dependencies. The compiler rejects any source import that escapes the consumer. Command environments remove repository executables from inherited PATH and clear NODE_PATH, so missing consumer tools cannot fall back to root dependencies. `compiler-undeclared-dependency` also proves that installing an adapter does not expose its transitive core dependency to application imports.

No successful test result or database state is cached. Docker can reuse immutable image layers; pnpm can reuse content-addressed downloads. Candidate packages are always rebuilt, packed, hashed, and installed in fresh directories. No cache uses a package version alone as evidence of candidate identity.

## Debug a failure

Failures retain a complete consumer, installed dependencies, local candidate tarballs, compiler output, generated files, and `.consumer/logs/` under `tests/.artifacts/<run>/<scenario>/`. `.consumer/environment.json` records versions and candidate/configuration hashes; `graph.json` records the verified dependency lock, `failure.json` records the failed stage and observations, and `expected.snap` preserves the reviewed contract when present. Docker build/service logs live under `tests/.artifacts/typesql-consumers-*/`. CI uploads this directory on failure before cleanup.

On a machine with the pinned runtimes, enter the retained directory and run its normal commands:

```sh
cd tests/.artifacts/<run>/pg-left-join
export DATABASE_URL=postgres://postgres:typesql@localhost:5432/debug_consumer
export SQLITE_PATH="$PWD/debug.db"
pnpm run setup       # when the scenario defines it
pnpm run generate    # when the scenario defines it
pnpm run compile
pnpm run start       # when the scenario defines it
```

Create `debug_consumer` as a fresh PostgreSQL database first (UTC, UTF-8, C collation). Original databases are always dropped. Use a fresh directory/database or SQLite file before repeating setup or application code that creates tables. All candidate references are relative to the retained consumer; moving it does not require rebuilding the library.

For Docker debugging, use the image from the failing Compose build (its tag is recorded in `docker.log`): mount the retained consumer at `/consumer`, choose that working directory, and override the image's entrypoint with `bash`. Attach a fresh PostgreSQL service or supply a reachable database URL. Its ordinary `pnpm` commands then use the same Node, Bun, compiler, drivers, and candidate packages.

## Reproduce a bug

Add a minimal consumer using the affected public workflow. Derive its intended contract from the documentation and actual database behavior; record and review those expectations. Run it against the unfixed checkout and preserve the relevant failure. Fix the library, then rerun the same scenario without weakening its expectations. Run the complete suite and retain the reproduction. Snapshot updates require an explicit `--update` and review of the diff; a passing snapshot update is not evidence that the intended contract is correct.

The [workflow inventory](inventory.md) maps documented workflows to executable consumers. The suite intentionally replaces broad generated SQL, PostgreSQL regression, AST, and fuzz coverage. It checks these workflows and permanent reproductions in one pinned environment; it does not establish correctness for every SQL program or compatibility with every dependency version.
