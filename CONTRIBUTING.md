# Contributing

## Change intents

When you change `src/`, `README.md`, `LICENSE` or `package.json` of a published package
(`@typesql/core`, `pg`, `postgres`, `sqlite`, `mysql`, `kysely`, `drizzle`, `prisma`, `cli`, `better-auth`, `effect`, `language-server`), add an intent in the same commit:

```sh
pnpm change @typesql/core --bump patch --summary "What users now see."
pnpm check:intents
```

- Name only the packages you changed, and `typesql` for a change to `packages/language-server/src`, which the extension bundles.
- The VS Code extension (`packages/vscode`, package name `typesql`) is released the same way:
  add `pnpm change typesql …` with every user-facing change to it.
- Use `--bump patch` for fixes, `major` for anything that could break users and `none` for internal changes.
- Write the summary like the existing `.changeset/*.md` files.

## Tests

Tests are scenario projects in `tests/scenarios/`, run against the databases in `tests/compose.yaml`. See [tests/README.md](tests/README.md) for setup and how a scenario is written.

```sh
pnpm test                      # all scenarios; run before finishing a change
pnpm test <scenario>           # one scenario
pnpm test <scenario> --update  # update its snapshot, then review the diff
```

To fix a bug:

1. Add a small scenario that uses the public API and shows the bug.
2. Write the expected result from the documented behavior and the real database, and check that the scenario fails.
3. Fix the bug without weakening the expected result, and keep the scenario.

Only update a snapshot when the new output is correct, not just because it changed. Don't add other kinds of tests.

## Before pushing

Run what CI runs (`.github/workflows/checks.yml`) and push only when it passes:

```sh
pnpm check     # lint, build, typecheck, knip, change intents, extension package, docs build
pnpm check:db  # scenario suite and generated PostgreSQL sources; needs tests/compose.yaml running
```

When you change `checks.yml`, change these scripts with it.

## Releases

The maintainer releases from `main` with `pnpm release`, which runs the `release` workflow.
Don't release, publish, tag, or edit `.changeset/ledger.yaml` or `.changeset/changelogs/`
unless asked.
