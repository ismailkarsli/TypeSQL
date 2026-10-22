# Errors and limits

## Reading errors

When a statement is wrong, the type of the SQL argument becomes
`"…your SQL…" & SqlError<"message", position>`, so the error is reported on the string.
Messages use Postgres's wording; the position is the index of the offending token (counting
words, operators and literals from 0):

| Mistake | Message |
|---|---|
| unknown column | `column "nme" does not exist` |
| typo | `column "emial" does not exist. Perhaps you meant the column "email"?` |
| unknown table | `relation "post" does not exist. Perhaps you meant the relation "posts"?` |
| ambiguous column | `column reference "id" is ambiguous` |
| bad alias | `missing FROM-clause entry for table "x"` |
| syntax | `syntax error at or near garbage`, `syntax error at end of input` |
| missing `NOT NULL` column | `null value in column "email" of relation "users" violates not-null constraint` |
| writing to a view | `cannot insert into view "user_stats"` |
| `DEFAULT` outside a `VALUES` item or `SET` value | `DEFAULT is not allowed in this context` |
| set operation width | `each UNION query must have the same number of columns` |
| wrong inline value | `parameter $1: a string value cannot be used as int4` |
| JSON value outside JSON | `parameter $1: a sql.json() value cannot be used as text NOT NULL` |
| raw array for JSON | `parameter $1: an array for jsonb NOT NULL must be passed as sql.json(value) …` |
| non-literal SQL | `the SQL text is not a string literal: …` |

Wrong positional arguments are ordinary TypeScript errors on the argument
(`Argument of type 'string' is not assignable to parameter of type 'number'`; for a raw array
passed to a JSON parameter, `… parameter of type 'NonArrayOrSqlJson<Item[]>'`: pass
`sql.json(value)`).

## The escape hatch

`sql.as<Row>(text, …)` skips inference and takes the row type you give it. Use it for SQL that
typesql does not support or cannot see at compile time (dynamic fragments). It accepts slots,
`:name` and inline parameters like `sql()`.

## Limits

typesql runs inside the TypeScript compiler, so it works within the compiler's budgets.
Measured on TypeScript 7.0.2:

| Workload | Cost |
|---|---|
| a typical query (join, `GROUP BY`, two parameters) | ~30K type instantiations |
| 100 simple queries in one file | ~0.7 s check time |
| 100 larger queries in one file | ~2 s check time |
| one 8 KB statement | infers, ~1.5 s |

- Statements can be up to 4096 tokens.
- Chains of about 100 `||` or `+` operators hit TypeScript's depth limit. `AND`/`OR` chains
  are balanced by the parser and are fine at 200+ terms.
- `sql.list` checks one statement with every distinct element once, so its cost grows with the
  number of distinct elements, not with the number of combinations (80 distinct sort
  elements: ~0.2M instantiations). In a select list it counts every element as selected.
- A fragment whose text is a union (`sql.id(name)` with `name: "a" | "b"`) is checked once
  per member, so two such slots in one statement cost `n × m` checks. A generic `sql.id`
  over `RelationName<DB>` checks the statement against every table and view. For lists, use
  `sql.list`, which costs one check.
- `sql.set` and `sql.values` are checked like `sql.list`, with every key of the input type once.
  The schema does not tell identity `GENERATED ALWAYS` columns apart from other columns with a
  default, so writing one is accepted (Postgres rejects it without `OVERRIDING SYSTEM VALUE`).
- A `sql.json(value)` passed as a positional or named argument is only checked to be JSON, not
  against a `Json<T>` column's `T` (it is when written inline, in `sql.set` / `sql.values` or as
  a `sql.fragment` argument).
- `sql.valueOrDefault` inside `sql.fragment(…)` has its value type checked, but not whether
  `DEFAULT` is allowed where the fragment is spliced.
- In editor hovers, row types list their keys alphabetically (TypeScript 7 orders the keys of
  computed object types). The rows the driver returns keep the `SELECT` order.

- A whole-row reference (`to_json(t)`, `(t).*`) is nullable when all of the row's columns are,
  since that is how the outer side of a join looks. A table whose columns are all nullable is
  therefore typed as a nullable row even when it is not joined.

- Typed JSON (see [JSON](./queries#json)) needs literal keys and paths: `json_build_object(col, …)`
  or `-> $1` on an object gives plain JSON or the union of all members. Only the string literals
  `'[]'`, `'{}'`, `'null'`, `'true'` and `'false'` keep their value when they meet typed JSON
  (`coalesce(json_agg(x), '[]')`); any other literal makes the result `unknown`. Functions that
  rewrite JSON (`jsonb_set`, `||`, `jsonb_strip_nulls`, `json_populate_record`, `jsonb_path_query`,
  `json_each`) return plain JSON, and so does `row_to_json(ROW(…))`.
- A `Json<T>` column's `T` is trusted. Positional and named parameters for it are typed `T` but
  passed to the driver as they are; only `sql.json()` makes arrays work with node-postgres.
- Inside JSON, `int8` and `numeric` are numbers: `JSON.parse` rounds integers beyond 2^53, and a
  `float8` / `numeric` that is `NaN` or `Infinity` is serialized as a string. Elements of
  Postgres arrays are typed non-null, as for array columns.

Unsupported syntax is always a compile error, never a silent `any`. Notable gaps: `ROWS FROM
(…)`, tracking which views depend on which tables, and column alias lists on plain tables. The
[DDL reference](../reference/ddl#limitations) lists the DDL limitations.
