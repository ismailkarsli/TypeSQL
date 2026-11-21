---
name: typesql-update
description: Update TypeSQL monorepo dependencies, runtimes, and lockfile, or fix Dependabot alerts.
---

# Update TypeSQL

Follow `AGENTS.md`, `CONTRIBUTING.md`, and `tests/README.md`. Preserve existing changes.

1. Inspect `pnpm-workspace.yaml`, manifests, `.node-version`, and the lockfile. Discover updates with `pnpm outdated -r --include-workspace-root`; verify targets using registry metadata and official release notes.
2. Edit shared versions in the catalog; preserve `catalog:`, `workspace:*`, intentional prereleases, release-age policies, and build approvals. Keep Prisma packages and Effect SQL packages compatible within their families; Prisma's transitive Effect may use another major.
3. Synchronize pnpm `packageManager` pins, including `tests/package.json`. Validate with the pinned Node and pnpm. Preserve Bun's runtime protocol; keep `@types/vscode` aligned with `engines.vscode`. Update database images and CI actions only within scope, preserving digest/SHA pins and database expectations in `tools/servers.ts`.
4. For security fixes, read `gh api --paginate 'repos/{owner}/{repo}/dependabot/alerts?state=open&per_page=100'` and `pnpm audit --json`. Trace every affected path with `pnpm why --recursive <package>`. Prefer a compatible parent upgrade; otherwise use a narrow parent/version override with an advisory and removal condition. Avoid forcing unrelated majors or dismissing affected alerts.
5. Remove stale overrides and comments after verifying compatible, patched resolutions without them. Maintain `minimumReleaseAgeExclude`: remove unused or old-enough entries and keep necessary exceptions pinned to exact selected versions.
6. Run `pnpm install` to regenerate the lockfile. For a requested transitive refresh, use `pnpm -r --include-workspace-root update`. Review peer warnings with `pnpm peers check` and inspect the diff.
7. Apply change intents per `CONTRIBUTING.md`; catalog/lockfile-only edits need none. Review snapshot changes before updating them; Node upgrades can change SQLite introspection headers. Source bug fixes require the documented scenario-first workflow.

Validate with the selected runtimes:

```sh
docker compose -f tests/compose.yaml up -d --wait
pnpm install --frozen-lockfile
pnpm check
pnpm check:db
pnpm audit
git diff --check
```

Both checks must pass before every commit or push. Let archived docs builds and PostgreSQL generation checks finish. Confirm vulnerable versions disappeared from every path; report changes, deferred upgrades, and validation results. GitHub alerts may await a default-branch scan.

Commit/push only when requested, on the current branch unless instructed otherwise. Do not release, publish, tag, edit release ledgers/changelogs, create issues, or post issue comments without an explicit request.
