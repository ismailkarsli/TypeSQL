## 0.0.2

### Patch Changes

- Fix editor completions inside SQL strings taking about a minute and leaving "Type instantiation is excessively deep" (TS2589) in the diagnostics until the language server restarts.

- Queries have `execute`, `executeTakeFirst` and `executeTakeFirstOrThrow` (throws `NoResultError`), running on an `Executor` passed to `createSql(executor)` or to the call.
