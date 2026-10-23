# Vendored sources

## postgres

A git submodule of [PostgreSQL](https://github.com/postgres/postgres), pinned to a release tag.
The parser is tested against its regression tests, `src/test/regress/{sql,expected}`
(`pnpm pg-regress:setup`, then `pnpm test:pg-regress`).

**The official tests are the gold source. Never modify, reformat, add or delete anything in
`vendor/postgres`.** Disagreements with Postgres are recorded on our side, in
`packages/core/test/pg-regress/baseline.json`. To update, move the submodule to a newer tag
with `pnpm pg-regress:setup <tag>`.

See [PostgreSQL regression tests](../packages/docs/internals/development.md#postgresql-regression-tests).
