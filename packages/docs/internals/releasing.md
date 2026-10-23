# Releasing

Versions and changelogs are managed by pnpm itself (pnpm ≥ 11.13; the repository pins pnpm 12 in
`packageManager`), not by a Changesets dependency: `pnpm change` records what changed,
`pnpm version -r` turns that into versions and changelogs, and `pnpm publish -r`, run only by
the `release` workflow through npm trusted publishing, publishes. Two scripts fill the gaps pnpm leaves:
`scripts/check-intents.mjs` enforces intents and `scripts/github-releases.mjs` creates GitHub
releases. See pnpm's [release management](https://pnpm.io/versioning) docs for the full model.

The published packages are `@typesql/core`, `@typesql/pg`, `@typesql/postgres`,
`@typesql/kysely`, `@typesql/drizzle` and `@typesql/prisma`. `@typesql/bench` and
`@typesql/docs` are private: they are never published, but they still get a version and a
committed `CHANGELOG.md` whenever a package they depend on is released. The VS Code extension
(`packages/vscode`, package name `typesql`) is private on npm too, and is published to the
Visual Studio Marketplace and Open VSX instead (see [VS Code extension](#vs-code-extension)).

## Recording a change

A commit or pull request that changes the behaviour of a published package adds a change intent
in the same commit:

```sh
pnpm change                                                # interactive; packages changed since main are preselected
pnpm change @typesql/kysely --bump patch --summary "…"     # non-interactive, for scripts and agents
pnpm change @typesql/core --bump none --summary "…"        # an explicit "no release needed"
pnpm change status                                         # pending intents and the release plan they produce
```

The interactive form needs a terminal; anywhere else pass the package names, `--bump` and
`--summary`. The result is a file such as `.changeset/brave-roses-obey.md`:

```md
---
"@typesql/core": patch
---

A parameter tested with `IS NULL` or `IS NOT NULL`, as in `($1::text IS NULL OR col = $1)`, accepts `null`.
```

- The summary becomes the changelog entry word for word. Write one sentence on the behaviour a
  user now sees, with identifiers in backticks; leave out the implementation.
- Name only the packages whose code changed. Packages that depend on them through
  `workspace:*` are bumped automatically and get an "Updated dependencies" entry.
- One change, one intent. A change that spans packages lists all of them in one file (as
  `.changeset/wise-snails-clean.md` does for the five integration packages).
- To fix a summary before it is released, edit the intent file.

### Enforcement

`pnpm check:intents` (CI's `intents` job) fails when a published package's shipped files
changed since `origin/main` (in CI: since the pull request's base, or the previous commit of a
push) and no intent added in that range names the package. Shipped files are the entries of
the package's `files` field (`src`, `README.md`, `LICENSE`) plus `package.json`; a change to
`version` alone, as in a release commit, does not count. Tests, examples, the docs site and the
private packages need no intent. When a change needs no release (a refactor, a README typo),
record that with `--bump none`. Run it before pushing:

```sh
pnpm check:intents             # against origin/main, uncommitted intents included
pnpm check:intents HEAD~3      # against another base
```

## Cutting a release

Packages are versioned and published only by the `release` workflow
(`.github/workflows/release.yml`) through npm trusted publishing; nothing is published from a
local machine. With the intents to release pushed to `main`:

```sh
pnpm change status                 # check the plan: every bump and why
pnpm release                       # gh workflow run release.yml --ref main
```

The workflow runs only when started by hand on `main`, with `pnpm release` or **Run workflow** on
the Actions tab; pushing publishes nothing. It runs the `ci.yml` checks (`test`, `intents`,
`bench`) on the current `main`. Once they pass, its `publish` job runs `pnpm version -r` (bump
versions, write changelog sections, update the ledger) and commits the result to `main` as
`chore: release <version>` from `github-actions[bot]`, then builds and smoke-tests the
packages, runs `pnpm publish -r`, and creates the GitHub releases. `main` requires signed
commits, so the release commit is made through GitHub's API (`scripts/github-commit.mjs`),
which signs it, not with `git push`. It is rejected, and nothing is published, when `main`
moved after the run started; start it again. A commit made with the workflow's token starts no
other workflow, so `ci` does not run on the release commit, which changes only versions and
changelogs.

`pnpm publish -r` publishes every public package whose manifest version is not on the registry
yet and skips the rest. A run without pending intents therefore versions nothing and publishes
nothing. When a public package's current version is not on npm (an earlier run failed to
publish, or a release commit was pushed by hand), the run skips `pnpm version -r` and only
publishes what is missing (see [Pitfalls](#pitfalls)); run it once more to release the intents
added since. Cutting the release commit by hand still works: `pnpm version -r` on a clean,
up-to-date `main`, a signed commit, push, then `pnpm release`.

After a run, check that every bumped version is live:

```sh
for p in core pg postgres kysely drizzle prisma; do pnpm view @typesql/$p version; done
```

## Trusted publishing

npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) accepts an OIDC token that
GitHub issues to the `publish` job (hence `id-token: write`) instead of an npm token, so there
is no npm token in the repository secrets, and npm attaches a
[provenance](https://docs.npmjs.com/generating-provenance-statements) statement to every version
because the repository is public. npm trusts one workflow per package: the file
`release.yml` in `ismailkarsli/typesql`, running in the GitHub environment `npm`, which only
deploys from `main`. The workflow file name is part of that trust: renaming `release.yml` means
configuring every package again.

Setup, done once for this repository:

1. With the npm CLI logged in (`npm login`; needs npm ≥ 11.15 and 2FA on the account), create
   the trust for every published package, in a terminal:

   ```sh
   for p in core pg postgres kysely drizzle prisma; do
     npm trust github @typesql/$p --file release.yml --repo ismailkarsli/typesql --env npm --allow-publish --yes
     sleep 2
   done
   npm trust list @typesql/core
   ```

   The first call asks for 2FA in the browser; choosing to skip 2FA for 5 minutes covers the
   rest. A trust cannot be edited: to change one, create the new one and remove the old with
   `npm trust revoke @typesql/<p> --id <id>` (ids are in `npm trust list`). Each package should
   list exactly one, for `release.yml`. The same settings can be entered by hand
   on npmjs.com under each package's **Settings → Trusted Publisher** (all fields are
   case-sensitive and not validated until a publish uses them).
2. On GitHub, **Settings → Environments → npm** limits deployment branches to `main`, so no
   other branch can obtain a token npm accepts.
3. After the first release from CI succeeds, on npmjs.com under each package's
   **Settings → Publishing access**, require two-factor authentication and disallow tokens, then
   revoke any npm tokens that can publish.

A new package is the one exception: npm only configures trust for a package that already
exists, so its first version has to be published by hand (`pnpm publish` from its directory,
with 2FA) before step 1 can include it.

The `repository.url` in each package's `package.json` must keep pointing at this repository: npm
checks it against the workflow's repository.

## GitHub releases

pnpm creates no git tags and no GitHub releases, so `scripts/github-releases.mjs` does, as the
last step of the `publish` job. For every package version that is on npm and has no release yet,
it creates a release on the repository's Releases tab:

- tag and title `<name>@<version>` (`@typesql/core@0.0.3`), with the tag on the release commit
  that added the version's changelog section;
- notes taken from that section in `.changeset/changelogs/`, read from git history so they
  survive pruning, plus a link to the version on npm;
- `@typesql/core` marked "Latest", the others not, and versions with a prerelease suffix (from a
  [lane](https://pnpm.io/versioning)) marked as prereleases.

The workflow creates releases only for the versions it just published (from the
`pnpm publish -r --report-summary` output, so a registry that still reports the previous
versions does not matter). Its `GITHUB_TOKEN` was refused (HTTP 403) tags on the 0.0.2 and 0.0.3
release commits, whose workflow files differ from `main`'s, so older versions are backfilled by
a maintainer instead: from a checkout
with `gh` logged in, `node scripts/github-releases.mjs --dry-run` lists every published version
without a release, and the same command without `--dry-run` creates them. That only touches
GitHub; nothing is published to npm.

## VS Code extension

The extension in `packages/vscode` (`typesql.typesql`, marked preview) is versioned like the npm
packages but published by the `release` workflow's `extension` job, after `publish`:

- **Versions.** Only an intent naming it releases it: `pnpm change typesql --bump patch --summary "…"`.
  A release of `@typesql/core` does not bump it (core is only a devDependency: the extension loads
  the project's copy of `@typesql/core/editor`). `pnpm check:intents` does not cover it, since it
  is private on npm; add the intent with every user-facing change to `packages/vscode`.
  `pnpm version -r` writes its committed `packages/vscode/CHANGELOG.md`, which the `.vsix` ships
  and the Marketplace shows. Both registries reject prerelease suffixes (`0.1.0-beta.1`).
- **Publishing.** The job checks out the release commit, builds `@typesql/core` and the
  extension, packages `typesql.vsix` and publishes it with `vsce publish --azure-credential` and
  `ovsx publish --trusted-publishing`, both with `--skip-duplicate`: a run publishes the current
  version wherever it is missing and skips it elsewhere, so a failed job is retried with
  **Re-run failed jobs**, or by the next release. No token is stored: the Marketplace accepts a
  Microsoft Entra ID token of a managed identity that trusts this workflow, Open VSX an OIDC
  token of the workflow.
- **Switches.** Each registry is skipped until its variable is `true`: `VSCODE_MARKETPLACE` and
  `OPEN_VSX`, set on the `vscode` environment (**Settings → Environments → vscode → Environment
  variables**; repository variables work too). Releases work without them; set each once its
  setup below is done. Setting one later and running the release again publishes the current
  version there, even when there is nothing new to release.

After a release, check the listings:
[Marketplace](https://marketplace.visualstudio.com/items?itemName=typesql.typesql) and
[Open VSX](https://open-vsx.org/extension/typesql/typesql).

### One-time setup

The publisher id `typesql` is the `publisher` field of `packages/vscode/package.json` and must
be the same on both registries.

1. **GitHub environment.** Create the environment `vscode` under **Settings → Environments**,
   limited to the `main` branch, so no other branch can obtain the tokens below.
2. **Visual Studio Marketplace** (Microsoft Entra ID; Azure DevOps personal access tokens are
   retired on December 1, 2026):
   1. Create the publisher `typesql` at
      [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage).
   2. In the Azure portal, create a user-assigned managed identity. It needs no Azure role or
      subscription: the workflow logs in with `allow-no-subscriptions`. Under **Federated
      credentials**, add one with the scenario **Other issuer** (the GitHub scenario builds a
      subject in the old format):
      - issuer `https://token.actions.githubusercontent.com`, without a trailing slash;
      - subject `repo:ismailkarsli@17887754/TypeSQL@1418220756:environment:vscode`: this
        repository uses immutable subject claims, which carry the owner's and the repository's
        ids, and Entra compares the subject case-sensitively (`TypeSQL`, not `typesql`). The
        `azure/login` step prints the subject GitHub sends (`subject claim - …`); copy it from
        there if it ever changes;
      - audience `api://AzureADTokenExchange`.
   3. On the `vscode` environment, set the variables `AZURE_CLIENT_ID` (the identity's client
      id) and `AZURE_TENANT_ID`, and `VSCODE_MARKETPLACE` to `true`.
   4. Run the release workflow. The `extension` job's **Marketplace identity** step prints the
      identity's Marketplace id; publishing fails until that id is a member of the publisher.
      Add it on the publisher's **Members** page with the Contributor role, then
      **Re-run failed jobs**.
3. **Open VSX** (trusted publishing):
   1. Log in at [open-vsx.org](https://open-vsx.org) with GitHub, link an Eclipse account and
      sign the Publisher Agreement (profile page).
   2. Create an access token (**Settings → Access Tokens**) and the namespace, once, from a
      terminal: `npx ovsx create-namespace typesql -p <token>`. Delete the token afterwards; the
      workflow does not use it.
   3. Under [trusted publishers](https://open-vsx.org/user-settings/trusted-publishers), add one
      for the namespace `typesql`: repository `ismailkarsli/typesql`, workflow `release.yml`,
      environment `vscode`. Like npm's, the trust names the workflow file: renaming `release.yml`
      means registering it again.
   4. Set the variable `OPEN_VSX` to `true` on the `vscode` environment, and run the release
      again: with nothing new to release, it publishes the current version to Open VSX.

## Files

| Path | What it is |
|---|---|
| `.changeset/<name>.md` | A pending change intent. Deleted by a later `pnpm version -r` once every package it names has been released and the registry has the version. |
| `.changeset/ledger.yaml` | Append-only record, keyed by `name@version`, of which intents each release consumed. It is what stops an intent from being applied twice (after a cherry-pick, say). Never edit it by hand. |
| `.changeset/changelogs/<scope>!<name>@<version>.md` | The changelog section of a release that is not yet confirmed on the registry. Removed once it is. |
| `packages/bench/CHANGELOG.md`, `packages/docs/CHANGELOG.md` | Changelogs of the private packages, which are always committed. |

Published packages have no committed `CHANGELOG.md`: changelog storage is pnpm's default
`registry` mode, so `pnpm publish` composes the package's `CHANGELOG.md` from the new section plus
the changelog of the previously published version and packs it into the tarball. Versioning
settings (fixed groups, ignored packages, lanes, `changelog.storage`) would go under a
`versioning:` key in `pnpm-workspace.yaml`; the repository uses the defaults.

CI runs `pnpm change check`, which fails when an intent names a package that does not exist or
the committed versions break a configured versioning rule.

## Pitfalls

- **Publish everything a release bumped.** `workspace:*` is published as the exact version, so
  `@typesql/kysely@0.0.3` depends on `@typesql/core@0.0.3`; publishing the dependent without
  `@typesql/core@0.0.3` leaves it uninstallable. Check with `pnpm view` after every release.
- **Publish before cutting the next release.** For a package whose current version was bumped
  but never published, `pnpm version -r` does not bump again: the new intents go into the same
  unreleased version (`0.0.3 → 0.0.3` in `pnpm change status`) and its changelog section is
  rebuilt without the entries of the earlier run. The `release` workflow therefore skips
  `pnpm version -r` while any public version is unpublished. When cutting a release commit by
  hand, run `pnpm release` right after it, before the next `pnpm version -r`.
- **Build first.** The tarballs ship `dist/` and the packages have no publish-time build script;
  the `publish` job builds and smoke-tests the output first. Keep it that way when editing the
  workflow: a bare `pnpm publish -r` publishes whatever `dist/` holds.
