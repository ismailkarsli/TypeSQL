# Design decisions

Outcomes of the open questions in the original plan (`PLAN.md` §12 in the repository) and of
choices made during implementation.

## Open questions from the plan

1. **Package names.** The project and its core package are named `typesql` (unscoped); the
   adapters are `@typesql/pg` and `@typesql/postgres`. All of these names are unpublished on npm
   (registry returns 404, checked 2026-10-14). The `typesql` scope itself already exists on npm
   (the registry answers 200 for it and 404 for an unknown scope) and holds no public packages:
   publishing the adapters requires being, or being added to, the account or organization that
   owns it. The unscoped `typesql` only needs an npm account.
2. **Runtime schema object in `createSql`.** Kept type-only, as planned. `migrations()` holds
   the DDL statements at runtime, which covers the `migrate()` use case without a second
   schema representation.
3. **`date`/`timestamp` under the drivers.** Both drivers return `Date` for `date`,
   `timestamp` and `timestamptz` by default (postgres.js parses OIDs 1082/1114/1184; verified
   in `node_modules/postgres/src/types.js`). The plan's assumption that postgres.js returns
   `date` as a string was wrong. Details on the [Adapters](../guide/adapters#dates) page.
4. **WHERE-based nullability narrowing.** Pulled forward from M7 into the query-structure work:
   `WHERE c IS NOT NULL` (and comparisons on `c`) combined with top-level `AND` make `c`
   non-null in the same query level's projection; `OR`/`NOT` never narrow.

## Implementation decisions

- **Index-based parser.** Tokens are addressed by index (`T[I]`, `Nx<I>` from a generated
  successor table) instead of tuple slicing, which was O(n²) in practice. See
  [Type engine](./engine).
- **Error positions are token indexes**, not character offsets. Semantic errors locate the
  first quoted identifier from the message in the token stream.
- **"Did you mean" hints** use a bounded Levenshtein distance (≤ 2) over the columns of the
  relations mentioned in the statement, only on the error path.
- **Named parameters** (`:name`) are rewritten to `$n` in first-appearance order, at the type
  level and at runtime. Mixing styles in one statement is an error.
- **Fragments** are spliced into the literal before lexing; outer parameters keep `$1..$k`,
  fragment parameters are renumbered after them. A non-literal fragment forces `sql.as`.
- **Cast parameters** (`$1::T`) are non-null on both sides: the caller must pass a `T`, and
  the projected column is `T`.
- **Type map precedence**: an exact map entry (`"numeric[]"`) wins over element-wise array
  mapping, so adapters can describe driver quirks such as pg's `numeric[]` → `number[]`.
- **`count(*)` and other `int8` results** are `string` under `pg` and the default map,
  `bigint` under `PostgresJsBigIntTypeMap`.
- **Duplicate output names**: the last column wins, matching how both drivers build row
  objects.

- **Shallow `Expr` constraint type.** `Expr` is `{ t: ExprTag; [field]: any }`; the precise
  union is `ExprNode`. Deep structural comparisons broke on ~50-term expressions.
- **Balanced `AND`/`OR` trees** in the parser keep long boolean chains shallow.
- **Row key order in hovers** is alphabetical under TypeScript 7 (it orders the keys of
  computed object types; neither intersections nor index-remapped mapped types preserve
  order). Runtime rows keep the SELECT order. Cosmetic; not fixable at the type level.
- **Subquery arity** follows Postgres: scalar/ARRAY subqueries need exactly one column
  ("subquery must return only one column"), `IN`/`ANY`/`ALL` need the left operand's width
  ("subquery has too many/few columns").

- **Inline parameters use an explicit marker** (`${sql.param(v)}`), not tagged templates and
  not bare `${v}`. Tagged templates erase the SQL text from the types; a bare `${v}` has
  already been pasted into the string when `sql()` runs. The marker's *type* is a literal that
  encodes the value's TS type (NUL-delimited, so it cannot collide with SQL), which lets the
  engine check values against parameter types; its *runtime* value is a single-use token with
  a per-process random prefix that `sql()` swaps for `$n`.
- **Only literal SQL text is analysed.** Text with non-constant interpolations is a compile
  error pointing to parameters, `sql.id()`, fragments or `sql.as`.
- **Fragment values are type-checked when spliced** (`Fragment`'s third type parameter carries
  their encoded types), including positional and `:name` values given at creation.

## Not done (needs a human)

- Publishing to npm (outward-facing; needs credentials, and access to the `@typesql` scope for the adapters).
- Hosting this documentation site: it builds from `packages/docs` (`pnpm docs:build`) but is not
  deployed anywhere yet.
