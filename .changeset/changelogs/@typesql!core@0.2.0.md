## 0.2.0

### Minor Changes

- An optional type cache: with TypeScript 7.1, list `@typesql/core` under `contentMappers` in tsconfig and add a `.typesqlcache` file, and a background job keeps it filled with query, call and DDL results that the checker uses instead of computing them again, only while everything they were computed from is unchanged (500 queries: 2.6 s of check time without, 0.13 s with). See the "Type cache" guide.

- Requires TypeScript 7.1 or later (7.1.0-beta works), declared as a peer dependency.

### Patch Changes

- Type-checking a query costs a little less: the scans for `$n`, `:name` and quoted text at the call site do less work.

- Building a query with `:name` parameters or `{slot}` fragments takes about half as long: the text rewrites are remembered per statement.
