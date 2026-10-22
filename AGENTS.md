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

## Releases

Don't release, publish, tag, or edit `.changeset/ledger.yaml` or `.changeset/changelogs/`
unless asked. If asked, follow [packages/docs/internals/releasing.md](packages/docs/internals/releasing.md).
