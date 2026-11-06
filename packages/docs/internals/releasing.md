# Releasing

Releases use pnpm's [release management](https://pnpm.io/versioning): `pnpm change` records
intents, `pnpm version -r` turns them into versions and changelogs, and the `release` workflow
publishes. Nothing is published from a local machine.

`@typesql/core`, `pg`, `postgres`, `kysely`, `drizzle`, `prisma`, `sqlite`, `mysql`, `cli` and
`better-auth` form a fixed group: they always share one version, released at the highest bump
among their intents. `@typesql/language-server` and the VS Code extension (`typesql`) have their
own versions.

## Recording a change

A commit that changes a published package's shipped files (`src`, `README.md`, `LICENSE`,
`package.json`) adds an intent in the same commit:

```sh
pnpm change @typesql/kysely --bump patch --summary "…"
pnpm check:intents
```

- The summary is the changelog entry: what users now see, in as many sentences as it takes,
  identifiers in backticks.
- Name only the packages you changed; dependents and the fixed group follow automatically.
  The extension bundles `packages/language-server`, so a change to its `src` also names `typesql`.
- `patch` for fixes, `major` for anything that could break users, `none` only for internal
  changes.
- One change, one intent file in `.changeset/`. Edit the file to fix its summary before release.
- `check:intents` covers the VS Code extension (`typesql`) too: its packaged files are the
  `.vscodeignore` entries, `src` and the `src` of the workspace packages it bundles. Use
  `--bump none` for a language-server change that VS Code users don't see. Prerelease versions
  are rejected by its registries.

## Cutting a release

From `main`, with the intents pushed and `checks` green:

```sh
pnpm change status
pnpm release
```

`pnpm release` starts the `release` workflow (owner only, `main` only). It:

1. runs `pnpm version -r` and commits the versions and changelogs to `main` as a signed commit;
2. builds and runs `pnpm publish -r`, then creates the GitHub releases;
3. publishes the VS Code extension to the Marketplace and Open VSX;
4. deploys the docs to Cloudflare.

If `main` moved during the run, the commit is rejected and nothing is published; run it again.
A run without intents publishes nothing but still deploys the docs. A failed extension job can be
retried with **Re-run failed jobs**.

Check that every version is live:

```sh
for p in $(node tools/packages.ts npm name); do pnpm view "$p" version; done
```

## If publishing fails

When a package's version is committed but not on npm, the next run skips `pnpm version -r` and
only publishes what is missing. Run it once more to release intents added since. Don't run
`pnpm version -r` yourself until everything is published: it would merge the new intents into
the unpublished version.

## Don't touch

`.changeset/ledger.yaml` and `.changeset/changelogs/` are managed by pnpm; never edit them by
hand. `CHANGELOG.md` must stay out of each package's `files`.
