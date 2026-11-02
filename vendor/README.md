# Vendored sources

`postgres` is a git submodule of [PostgreSQL](https://github.com/postgres/postgres), pinned to a release tag. The former regression runners have been retired in favor of the [consumer suite](../tests/README.md). The submodule remains unchanged for reference.

Never modify, reformat, add or delete files in `vendor/postgres` to make a test pass.
