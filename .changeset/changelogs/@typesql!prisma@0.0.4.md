## 0.0.4

### Patch Changes

- `queryRaw` throws for a query built with `rowKeys: "camelCase"`, whose keys a `PrismaPromise` cannot rename, instead of returning rows that do not match its type.

- Updated dependencies:
  - @typesql/core@0.0.4
