# Agent instructions

## Change intents

When you change `src/`, `README.md`, `LICENSE` or `package.json` of a published package
(`@typesql/core`, `pg`, `postgres`, `kysely`, `drizzle`, `prisma`), add an intent in the same commit:

```sh
pnpm change @typesql/core --bump patch --summary "One sentence on what users now see."
pnpm check:intents
```

- Name only the packages you changed.
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

## Releases

Don't release, publish, tag, or edit `.changeset/ledger.yaml` or `.changeset/changelogs/`
unless asked. If asked, follow [packages/docs/internals/releasing.md](packages/docs/internals/releasing.md).
