---
"@typesql/core": minor
---

An adapter can give `sql` statements of its own instead of `Query`s: `createStatementSql(dialect, statement)` and `SqlStatement` from `@typesql/core/adapter` make them, and `Sql<DB, TM, Plugins, S>` and `SqlOf<T, DB, TM, Plugins, S>` take their kind `S` (default `QueryStatement`). Such a statement splices as `${statement}` with the number brand `InlineStatement` where a `Query` has a string, so it can be iterable, and `RowType<Q>` reads its row. `DialectBrand` and `AnyDialectBrand` carry the statement kind, so an `sql` of another kind is not assignable to one of `Query`s.
