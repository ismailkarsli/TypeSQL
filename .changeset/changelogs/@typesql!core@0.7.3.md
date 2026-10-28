## 0.7.3

### Patch Changes

- Add reusable typed queries with sql.prepare(), compiling SQL and fixed fragments once before binding new parameter values.

- Fix PostgreSQL parse-tree disagreements in quoted types, function return types, and LIKE options.

- Speed up runtime query construction and inline parameter binding while preserving query execution behavior.
