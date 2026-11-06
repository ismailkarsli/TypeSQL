# Scenario tests

Requires Linux, the Node.js version in `.node-version` and the repository's pnpm version. pnpm installs Bun for the scenarios that run it, at the version in the root catalog. Start PostgreSQL, MySQL and MariaDB yourself with `docker compose -f tests/compose.yaml up -d --wait`, then run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm test                         # all scenarios
pnpm test pg-left-join            # one scenario
pnpm test pg-left-join --update   # update snapshots; review the diff
```

`tests/compose.yaml` pins the server versions and ports, and the runner checks a server's version before the first scenario that uses it; set `TYPESQL_DATABASE_URL`, `TYPESQL_MYSQL_URL` or `TYPESQL_MARIADB_URL` to use other instances. A scenario's `scenario.database` (`postgres`, `mysql`, `mariadb` or `sqlite`) selects the server; each run gets a database of its own in `DATABASE_URL` (with a `mysql://` or `mariadb://` scheme for those servers) or a file in `SQLITE_PATH`.

Scenarios live in `tests/scenarios/`. Copy an existing one, use `workspace:*` for TypeSQL and `catalog:` for external dependencies, and import public APIs. The runner builds the TypeSQL packages the scenarios depend on and runs temporary copies with the installed workspace dependencies, checking types, compiler errors, output, and generated files against `expected.snap`. Commands reuse the workspace-selected pnpm executable through `npm_execpath`, including in temporary copies outside the workspace.

A normal scenario has `package.json`, `app.ts` and `expected.snap`. Use ordinary `setup`, `generate` and `start` scripts for its public workflow. The runner compiles it with `tsc` and `tests/scenarios/tsconfig.base.json`, which a scenario's own `tsconfig.json` can override (without `extends` or path aliases); add a `compile` script only to compile differently. Export values or type aliases whose inferred types should be observed; `scenario.artifacts` lists generated files to snapshot. An intentional compiler or runtime rejection declares `scenario.failure` with its `stage` and `exitCode`; an application contains no assertions, suppressed expected errors or type-equality helpers.

A snapshot records each fact once: a failed compilation's diagnostics without the compiler's text output, and an uncaught exception without Node's report and stack trace. Redirect a tool's chatter to a log file in the scenario rather than into the snapshot.

For bug fixes, define the expected public types, diagnostics or database behavior first, reproduce the failure against the unfixed checkout, keep the scenario, and run the full suite after fixing it. Snapshot updates require `--update` and review; CI refuses updates. Include nullable and non-nullable cases when changing nullability.

Report a failure with the scenario, stage, command and expected-versus-observed difference. Missing tools or database connections are infrastructure failures, separate from intentional application rejections.

Failure logs and retained applications of the latest run are in `tests/.artifacts/`.
