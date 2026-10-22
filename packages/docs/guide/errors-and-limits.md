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
| non-literal SQL | `the SQL text is not a string literal: …` |

Wrong positional arguments are ordinary TypeScript errors on the argument
(`Argument of type 'string' is not assignable to parameter of type 'number'`).

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
- `sql.set` and `sql.values` are checked the same way, with every key of the input type once.
  The schema does not tell identity `GENERATED ALWAYS` columns apart from other columns with a
  default, so writing one is accepted (Postgres rejects it without `OVERRIDING SYSTEM VALUE`).
- `sql.valueOrDefault` inside `sql.fragment(…)` has its value type checked, but not whether
  `DEFAULT` is allowed where the fragment is spliced.
- In editor hovers, row types list their keys alphabetically (TypeScript 7 orders the keys of
  computed object types). The rows the driver returns keep the `SELECT` order.

Unsupported syntax is always a compile error, never a silent `any`. Notable gaps: `ROWS FROM
(…)`, tracking which views depend on which tables, and column alias lists on plain tables. The
[DDL reference](../reference/ddl#limitations) lists the DDL limitations.
