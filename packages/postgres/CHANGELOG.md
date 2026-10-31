# @typesql/postgres

## 0.3.2

### Patch Changes

- Update the README Playground examples to write columns with Col options instead of the removed Nullable and Generated helpers.

- Updated dependencies:
  - @typesql/core@1.0.0

## 0.3.1

### Patch Changes

- Run sql.transaction() on a postgres.js ReservedSql with BEGIN/COMMIT and savepoints instead of always rejecting, and stop accepting epoch-millisecond numbers for date parameters, which postgres.js 4 rejects.

- Fix the README Playground links, which opened with module resolution that ignores package exports and showed no TypeSQL errors or types.

- Updated dependencies:
  - @typesql/core@0.10.1

## 0.3.0

### Minor Changes

- Replace rowKeys options with CasePlugin while retaining bigint configuration.

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.10.0

## 0.2.14

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.9.2

## 0.2.13

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.9.1

## 0.2.12

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.9.0

## 0.2.11

### Patch Changes

- Updated dependencies:
  - @typesql/core@0.8.1
