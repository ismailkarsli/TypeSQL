# Agent instructions

## Change intents

When you change `src/`, `README.md`, `LICENSE` or `package.json` of a published package
(`@typesql/core`, `pg`, `postgres`, `sqlite`, `kysely`, `drizzle`, `prisma`, `cli`), add an intent in the same commit:

```sh
pnpm change @typesql/core --bump patch --summary "One sentence on what users now see."
pnpm check:intents
```

- Name only the packages you changed.
- The VS Code extension (`packages/vscode`, package name `typesql`) is released the same way:
  add `pnpm change typesql …` with every user-facing change to it. `pnpm check:intents` does not
  catch a missing one.
- Use `patch` for fixes. Use `major` for every change that could possibly break users, even
  when the break is unlikely.
- Write the summary like the existing `.changeset/*.md` files.

## Consumer tests and definition of done

`pnpm test` and `pnpm test:consumer` run the complete Vitest consumer suite in the pinned Docker environment. Use `pnpm test:consumer <scenario>` for a filtered iteration and run the complete suite before finishing a library or CLI change. CI runs every scenario without snapshot updates. See [tests/README.md](tests/README.md) and the [workflow inventory](tests/inventory.md).

For a bug fix:

1. Add a minimal standalone project under `tests/scenarios/` using the affected public workflow.
2. Define and review intended public types, diagnostics, database output/errors or generated files from documented behavior and the real database.
3. Observe the relevant failure against the unfixed checkout.
4. Fix the library and rerun the same consumer without weakening expectations.
5. Run the complete suite and retain the reproduction permanently.

A normal scenario contains `package.json`, `app.ts` and `expected.snap`. Use ordinary package scripts for setup, generation, compilation and execution. Add ordinary application files when needed. Applications contain no test assertions, suppressed expected compiler errors or type-equality helpers. External versions belong in the exact test workspace catalogs and its single committed lockfile; consumers run against installed checkout tarballs, never repository source imports, workspace aliases or registry TypeSQL packages.

Snapshot changes require an explicit `--update` and review. Never accept current output merely because it is current. Include nullable and non-nullable cases when changing nullability rules. Do not add another runner, generated SQL corpus, baseline, unit suite or coverage gate. Failures retain their isolated consumer and logs under `tests/.artifacts/`; report the scenario, stage, command and expected-versus-observed difference. Infrastructure failures are separate from application rejections.

`vendor/postgres` is an unchanged PostgreSQL submodule. Never modify, reformat, add or delete its files to make tests pass. The former parser, AST, oracle, fuzz and smoke runners and their corpora are retired.

Do not create GitHub issues or post issue comments automatically. Create them only when explicitly requested.

## Releases

Don't release, publish, tag, or edit `.changeset/ledger.yaml` or `.changeset/changelogs/`
unless asked. If asked, follow [packages/docs/internals/releasing.md](packages/docs/internals/releasing.md).
