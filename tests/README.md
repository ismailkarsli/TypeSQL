# Scenario tests

Requires Linux, Node, pnpm, and Bun. Start PostgreSQL yourself with `docker compose -f tests/compose.yaml up -d --wait`, then run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm test                         # all scenarios
pnpm test pg-left-join            # one scenario
pnpm test pg-left-join --update   # update snapshots; review the diff
```

Tests use PostgreSQL at `127.0.0.1:55432`; set `TYPESQL_DATABASE_URL` to use another instance.

Scenarios live in `tests/scenarios/`. Copy an existing one, use `workspace:*` for TypeSQL and `catalog:` for external dependencies, and import public APIs. The runner builds the libraries and runs temporary copies with the installed workspace dependencies, checking types, compiler errors, output, and generated files against `expected.snap`. Commands reuse the workspace-selected pnpm executable through `npm_execpath`, including in temporary copies outside the workspace.

For bug fixes, reproduce the failure first, keep the scenario, and run the full suite after fixing it.

Failure logs and retained applications are in `tests/.artifacts/`.
