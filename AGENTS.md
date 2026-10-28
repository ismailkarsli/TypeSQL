# Agent instructions

## Change intents

When you change `src/`, `README.md`, `LICENSE` or `package.json` of a published package
(`@typesql/core`, `pg`, `postgres`, `kysely`, `drizzle`, `prisma`), add an intent in the same commit:

```sh
pnpm change @typesql/core --bump patch --summary "One sentence on what users now see."
pnpm check:intents
```

- Name only the packages you changed.
- The VS Code extension (`packages/vscode`, package name `typesql`) is released the same way:
  add `pnpm change typesql …` with every user-facing change to it. `pnpm check:intents` does not
  catch a missing one.
- Use `patch` for fixes. Ask before `minor`, `major` or `none`.
- Write the summary like the existing `.changeset/*.md` files.

## Type cache version

After changing `packages/core/src` (except `src/cache/` and `src/runtime/`), run
`pnpm cache-version` and commit the updated `CacheVersion`. CI checks it.

## PostgreSQL regression tests

`vendor/postgres` holds PostgreSQL's official regression tests (a git submodule). They are the
gold source: never modify, reformat, add or delete files in it, and never edit them to make a
test pass. Record disagreements in `packages/core/test/pg-regress/baseline.json` with
`pnpm test:pg-regress --update`, and only when one went away or after moving to a new
PostgreSQL release; a new disagreement is a parser regression to fix. See
[packages/docs/internals/development.md](packages/docs/internals/development.md).

## Definition of done

A change to the engine or a new feature is done when the checks in
[packages/docs/internals/development.md](packages/docs/internals/development.md#definition-of-done)
pass: exact type tests (with a negative case for every nullability rule), no new disagreement in
the type oracles (`pnpm test:oracle`, with `--regress --views` for engine changes) or the fuzzer
(`pnpm fuzz`), changed-lines mutation testing (`pnpm mutate:types --changed`,
`pnpm mutate:runtime --changed`), coverage thresholds, and the change intent and `CacheVersion`.
Record unrelated engine findings in the reviewed baseline and fix them in separate commits.
Do not create GitHub issues or post issue comments automatically. Create issues or comments
only when the user explicitly requests them.

## Releases

Don't release, publish, tag, or edit `.changeset/ledger.yaml` or `.changeset/changelogs/`
unless asked. If asked, follow [packages/docs/internals/releasing.md](packages/docs/internals/releasing.md).
