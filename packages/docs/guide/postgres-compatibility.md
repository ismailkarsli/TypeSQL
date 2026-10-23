# Postgres compatibility

TypeSQL's parser is tested against PostgreSQL's own regression suite: the SQL scripts Postgres
runs on itself (`src/test/regress` of the [PostgreSQL 18.6](https://github.com/postgres/postgres/tree/REL_18_6/src/test/regress)
sources), about 50,000 statements across 233 files. For every statement, the expected output
Postgres ships with the tests records what Postgres did with it. TypeSQL must do the same:

- a statement Postgres parses, TypeSQL parses;
- a statement Postgres rejects with a syntax error, TypeSQL rejects.

**It agrees with Postgres on every statement it can check: 49,999 out of 50,235.** CI runs the
whole suite on every change and fails if a single statement disagrees.

| | Statements |
|---|---|
| In the suite | 50,235 |
| Checked, agreeing with Postgres | 49,999 |
| Checked, disagreeing | 0 |
| Not checked (see below) | 236 |

## What the suite covers

The regression suite exercises the whole language, edge cases first: every operator and literal
form, `MERGE`, `RETURNING old/new`, SQL/JSON (`JSON_TABLE`, `JSON_VALUE`, `IS JSON`, …), SQL/XML,
`TABLESAMPLE`, `ROWS FROM`, recursive CTEs with `SEARCH` / `CYCLE`, cursors, `CREATE SCHEMA` with
embedded objects, and hundreds of statements written to be syntax errors. The syntax TypeSQL
learned to pass it is typed by inference too (row types, nullability, parameter types and output
column names), not just parsed: see [Queries](./queries) and [Writing data](./writing-data).

## What is not checked

- **131 statements depend on psql's state.** psql substitutes variables before sending a
  statement. `:'v'` and `:"v"` are always a literal or an identifier, and `:v` after
  `\set v value` is that value, so those are checked; a variable set by a query (`\gset`) or by
  the environment has no known value.
- **96 statements run with `standard_conforming_strings` off** and contain a backslash. TypeSQL
  reads string literals the way Postgres does by default (on since PostgreSQL 9.1).
- **9 statements share a line with others** in a way that does not tell which one an error
  belongs to.

Utility statements without a schema effect (`CREATE INDEX`, `GRANT`, `SET`, `VACUUM`, …) are
accepted without being parsed in detail, so a syntax error inside one is not reported. Statements
that change the schema type (`CREATE TABLE`, `ALTER TABLE`, views, types, schemas) are parsed
clause by clause.

Agreeing on syntax means TypeSQL accepts what Postgres accepts. Types are checked separately: a
statement can parse and still be reported as a type error, as Postgres would (`column "x" does
not exist`). Where a type cannot be known statically, TypeSQL says so: rows of `FETCH` (the
cursor is declared in another statement), results of user-defined operators (`unknown`), and the
limits in [Errors and limits](./errors-and-limits).

## Reproducing it

```sh
pnpm pg-regress:setup     # check out PostgreSQL's regression tests (a submodule, ~20 MB)
pnpm test:pg-regress      # check every statement, about a minute
```

The official tests are used as they are, never edited. How statements are split and how
Postgres's outcome is read from the expected output is described in
[Development](../internals/development#postgresql-regression-tests).
