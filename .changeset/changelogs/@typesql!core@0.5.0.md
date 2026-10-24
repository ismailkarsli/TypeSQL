## 0.5.0

### Minor Changes

- What adapters and custom executors build on moved to `@typesql/core/adapter`: `createTransactionalSql`, `runTransaction`, `SqlDriver`, `mapRows`, `rowKeysOf`, `camelCase` and `JsonParam`.

- The engine's types (`Analyze`, `ArgsOf`, `KeyedRow`, `ListRep`, `SetRep`, the inline markers, lexer, parser, schema and type cache types, …) moved to `@typesql/core/engine`; the root keeps `Sql`, `Query`, `Fragment`, the schema helpers, `RowOf`, `ParamsOf`, `Validate`, `ApplyDdl` and the other types you write in application code.

- The root export is the user-facing API only: the standalone `param`, `valueOrDefault` and `json` are gone (use `sql.param`, `sql.json`), and so are the splice and query-building helpers (`splice`, `renumberParams`, `maxParam`, `quoteIdent`, `joinFragments`, `hasSlots`, `rewriteNamed`, `makeQuery`, `makeFragment`).

- `sql.valueOrDefault` is removed: `sql.param(value)` sends `DEFAULT` when the value is `undefined`, and a value that can be `undefined` is a compile error where `DEFAULT` is not allowed and inside `sql.fragment`.

- `sql.list` is merged into `sql.join`: joining a runtime array of fragments whose texts are known is checked as `sql.list` did, and `sql.join` throws when there are no items.

### Patch Changes

- No user-visible change: PostgreSQL's parser (libpg-query) is a development dependency, for a test that compares parse trees.

- No user-visible change: the type cache job evaluates statements through an internal module the type oracles share.

- Types follow PostgreSQL 18: `PgCatalog` has the new catalog columns (`pg_attribute.attcacheoff` is gone), the new built-in functions are known, and `reverse(bytea)` and `json(b)_strip_nulls(x, strip_in_arrays)` are typed.

- The README's documentation links point to the docs site, after its pages moved.

- No user-visible change: comments in the type engine say its rules are verified against PostgreSQL 18, which the type and function oracles now check.

- No user-visible change: simpler printed-type parsing in the type cache job, with mutation-testing annotations.
