# Agent instructions

## Change intents

When you change `src/`, `README.md`, `LICENSE` or `package.json` of a published package
(`@typesql/core`, `pg`, `postgres`, `sqlite`, `mysql`, `kysely`, `drizzle`, `prisma`, `cli`, `better-auth`), add an intent in the same commit:

```sh
pnpm change @typesql/core --bump patch --summary "What users now see."
pnpm check:intents
```

- Name only the packages you changed.
- The VS Code extension (`packages/vscode`, package name `typesql`) is released the same way:
  add `pnpm change typesql …` with every user-facing change to it. `pnpm check:intents` does not
  catch a missing one.
- Write the summary like the existing `.changeset/*.md` files.

## Scenario tests and definition of done

`pnpm test` runs the complete Vitest scenario suite locally against a PostgreSQL instance. Use `pnpm test <scenario>` for a filtered iteration and run the complete suite before finishing a library or CLI change. CI runs every scenario without snapshot updates. See [tests/README.md](tests/README.md).

For a bug fix:

1. Add a minimal workspace project under `tests/scenarios/` using the affected public workflow.
2. Define and review intended public types, diagnostics, database output/errors or generated files from documented behavior and the real database.
3. Observe the relevant failure against the unfixed checkout.
4. Fix the library and rerun the same scenario without weakening expectations.
5. Run the complete suite and retain the reproduction permanently.

A normal scenario contains `package.json`, `app.ts` and `expected.snap`. Use ordinary package scripts for setup, generation, compilation and execution. Add ordinary application files when needed. Applications contain no test assertions, suppressed expected compiler errors or type-equality helpers. External versions belong in the exact catalog in `pnpm-workspace.yaml` and the root `pnpm-lock.yaml`. Scenarios depend on TypeSQL packages through `workspace:*` and their public exports after building; never use repository source imports, TypeScript path aliases or registry TypeSQL packages. Temporary execution directories reuse installed workspace dependencies.

Snapshot changes require an explicit `--update` and review. Never accept current output merely because it is current. Include nullable and non-nullable cases when changing nullability rules. Do not add another runner, generated SQL corpus, baseline, unit suite or coverage gate. Failures retain their application and logs under `tests/.artifacts/`; dependencies remain linked to the workspace. Report the scenario, stage, command and expected-versus-observed difference. Infrastructure failures are separate from application rejections.

Do not create GitHub issues or post issue comments automatically. Create them only when explicitly requested.

## Releases

Don't release, publish, tag, or edit `.changeset/ledger.yaml` or `.changeset/changelogs/`
unless asked. If asked, follow [packages/docs/internals/releasing.md](packages/docs/internals/releasing.md).
