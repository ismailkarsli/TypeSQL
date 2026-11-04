# Scenario tests

Requires Linux, Node.js 26 (CI pins 26.8.1) and the repository's pnpm version. pnpm installs Bun for the scenarios that run it, at the version in the root catalog. Start PostgreSQL yourself with `docker compose -f tests/compose.yaml up -d --wait`, then run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm test                         # all scenarios
pnpm test pg-left-join            # one scenario
pnpm test pg-left-join --update   # update snapshots; review the diff
```

Tests use PostgreSQL at `127.0.0.1:55432`; set `TYPESQL_DATABASE_URL` to use another instance.

Scenarios live in `tests/scenarios/`. Copy an existing one, use `workspace:*` for TypeSQL and `catalog:` for external dependencies, and import public APIs. The runner builds the libraries and runs temporary copies with the installed workspace dependencies, checking types, compiler errors, output, and generated files against `expected.snap`. Commands reuse the workspace-selected pnpm executable through `npm_execpath`, including in temporary copies outside the workspace.

A normal scenario has `package.json`, `app.ts` and `expected.snap`. Use ordinary `setup`, `generate`, `compile` and `start` scripts for its public workflow. Export values or type aliases whose inferred types should be observed; `scenario.artifacts` lists generated files to snapshot. An intentional compiler or runtime rejection declares `scenario.failure` with its `stage` and `exitCode`; an application contains no assertions, suppressed expected errors or type-equality helpers.

For bug fixes, define the expected public types, diagnostics or database behavior first, reproduce the failure against the unfixed checkout, keep the scenario, and run the full suite after fixing it. Snapshot updates require `--update` and review; CI refuses updates. Include nullable and non-nullable cases when changing nullability.

Report a failure with the scenario, stage, command and expected-versus-observed difference. Missing tools or database connections are infrastructure failures, separate from intentional application rejections.

Failure logs and retained applications are in `tests/.artifacts/`.
