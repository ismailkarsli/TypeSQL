## 0.2.2

### Patch Changes

- `typesql introspect` types a view column built with `ROW(…)` NOT NULL (it was nullable), and without the `pg` package it says `typesql introspect: the "pg" package is not installed: npm install pg` instead of naming itself twice.

- Build and type-check the package with `tsrs`.

- Updated dependencies:
  - @typesql/core@0.6.1
