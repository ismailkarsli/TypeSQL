# Postgres compatibility

TypeSQL's parser is tested against the tests PostgreSQL runs on itself.

## The result

**TypeSQL agrees with Postgres on every statement it can check: 49,999 out of 50,235.**

| | Statements |
|---|---|
| In the suite | 50,235 |
| Checked, agreeing with Postgres | 49,999 |
| Checked, disagreeing | 0 |
| Not checked (see [below](#what-is-not-checked)) | 236 |

CI runs the whole suite on every change, and fails if a single statement disagrees.

## How it is tested

PostgreSQL ships a regression suite: the SQL scripts in `src/test/regress` of the [PostgreSQL 18.6](https://github.com/postgres/postgres/tree/REL_18_6/src/test/regress) sources. They hold about 50,000 statements across 233 files. Next to each script, Postgres ships the expected output, which records what Postgres did with every statement.

TypeSQL must do the same:

- a statement Postgres parses, TypeSQL parses;
- a statement Postgres rejects with a syntax error, TypeSQL rejects.

The official tests are used as they are, never edited.

## What the suite covers

The suite tests the whole language, edge cases first: every operator and literal form, `MERGE`, `RETURNING old/new`, SQL/JSON (`JSON_TABLE`, `JSON_VALUE`, `IS JSON`, …), SQL/XML, `TABLESAMPLE`, `ROWS FROM`, recursive CTEs with `SEARCH` / `CYCLE`, cursors, `CREATE SCHEMA` with embedded objects, and hundreds of statements written to be syntax errors.

The syntax TypeSQL learned to pass it is not just parsed: it is typed too (row types, nullability, parameter types and output column names). See [Selecting data](./queries) and [Inserting and updating](./writing-data).

## What is not checked

- **131 statements depend on psql's state.** psql replaces variables before it sends a statement. `:'v'` and `:"v"` are always a literal or an identifier, and `:v` after `\set v value` is that value, so those are checked. But a variable set by a query (`\gset`) or by the environment has no known value.
- **96 statements run with `standard_conforming_strings` off** and contain a backslash. TypeSQL reads string literals the way Postgres does by default (on since PostgreSQL 9.1).
- **9 statements share a line with others** in a way that doesn't tell which one an error belongs to.

## Syntax and types

Agreeing on syntax means TypeSQL accepts what Postgres accepts. Types are checked separately: a statement can parse and still be a type error, as in Postgres (`column "x" does not exist`).

- Utility statements without a schema effect (`CREATE INDEX`, `GRANT`, `SET`, `VACUUM`, …) are accepted without being parsed in detail, so a syntax error inside one is not reported.
- Statements that change the schema type (`CREATE TABLE`, `ALTER TABLE`, views, types, schemas) are parsed clause by clause.
- Some types can't be known statically; see [Limits](./limits#types-and-hovers).

## Run it yourself

From a clone of the repository:

```sh
pnpm pg-regress:setup     # check out PostgreSQL's regression tests (a submodule, ~20 MB)
pnpm test:pg-regress      # check every statement, about a minute
```

The [regression test runner](https://github.com/ismailkarsli/TypeSQL/blob/main/packages/core/test/pg-regress/run.ts) splits the statements and reads Postgres's outcome from the expected output.
