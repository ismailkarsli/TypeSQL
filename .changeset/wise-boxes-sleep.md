---
"@typesql/effect": patch
---

An `sql` with a plugin, such as `createSql<DB>(dialect, client).withPlugin(new CasePlugin())`, can be named by its type: annotated as `EffectSqliteSql<DB, DefaultTypeMap, [CasePlugin], never>` (or `EffectSql`, `EffectMysqlSql`, `EffectMariaDbSql`), or as `ReturnType<typeof makeSql>` in a callback. Before, these failed with `TS2589: Type instantiation is excessively deep and possibly infinite` (`TS5114` on PostgreSQL). The four types are now interfaces; `EffectSqlOf<Dialect, …>` names the one for a dialect, as before.
