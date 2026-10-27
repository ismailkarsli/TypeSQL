## 0.7.0

### Minor Changes

- `sql.combine(items, { separator })` replaces `sql.join(items, separator)`; editors suggest `", "`, `" AND "`, and `" OR "` while accepting other separator strings.

### Patch Changes

- Reject forged slot objects in queries by branding fragments and queries with a WeakSet.
