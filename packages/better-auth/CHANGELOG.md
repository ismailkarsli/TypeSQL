# @typesql/better-auth

## 7.7.1

## 7.7.0

## 7.6.0

## 7.5.0

## 7.4.1

## 7.4.0

### Minor Changes

- `typesqlAdapter(sql, { casing: "snake_case" })` stores Better Auth's tables and columns in snake_case: model names, core fields, `additionalFields` and plugin schemas, so `twoFactor` is `two_factor` and `requirePKCE` is `require_pkce`.

## 7.3.0

## 7.2.0

## 7.1.0

## 7.0.1

## 7.0.0

### Patch Changes

- Updated dependencies:
  - @typesql/core@7.0.0

## 6.2.0

## 6.1.4

## 6.1.3

### Patch Changes

- Rebuilt with updated development dependencies, with no change in behavior.

## 6.1.2

### Patch Changes

- Internal type-safety cleanup with no change in behavior.

## 6.1.1

## 6.1.0

### Minor Changes

- New package `@typesql/better-auth`: `typesqlAdapter(sql)` is a Better Auth database adapter that runs on a TypeSQL `sql` for PostgreSQL or SQLite, and reads the database from `sql.dialect`.
