# Errors and troubleshooting

When a statement is wrong, TypeSQL reports a compile error on the SQL string. This page shows how to read it, and what to do when TypeSQL can't type a statement.

## Reading errors

```ts
sql("SELECT emial FROM users");
// Argument of type '"SELECT emial FROM users"' is not assignable to parameter of type
//   'SqlError<"column \"emial\" does not exist. Perhaps you meant the column
//    \"email\"?", 1> & "SELECT emial FROM users"'.
```

The error has two parts:

- **The message** uses Postgres's wording, so it reads like the error you would get at runtime.
- **The position** (`1`) is the index of the offending token, counting words, operators and literals from 0. Here, `emial` is token 1.

## Common messages

| Mistake | Message |
|---|---|
| unknown column | `column "emial" does not exist. Perhaps you meant the column "email"?` |
| unknown table | `relation "post" does not exist. Perhaps you meant the relation "posts"?` |
| unknown function | `function slugify(text) does not exist. Declare it in the schema's $functions or in FunctionCatalog` (see [functions](./queries#expressions-and-functions)) |
| ambiguous column | `column reference "id" is ambiguous` |
| bad alias | `missing FROM-clause entry for table "x"` |
| syntax | `syntax error at or near garbage`, `syntax error at end of input` (see [Postgres compatibility](./postgres-compatibility)) |
| missing `NOT NULL` column | `null value in column "email" of relation "users" violates not-null constraint` |
| writing to a view | `cannot insert into view "user_stats"` |
| `DEFAULT` outside a `VALUES` item or `SET` value | `DEFAULT is not allowed in this context` |
| a column assigned twice | `multiple assignments to same column "email"` (`UPDATE`), `column "email" specified more than once` (`INSERT`) |
| set operation width | `each UNION query must have the same number of columns` |
| wrong inline value | `parameter $1: a string value cannot be used as int4` |
| JSON value outside JSON | `parameter $1: a sql.json() value cannot be used as text NOT NULL` |
| raw array for JSON | `parameter $1: an array for jsonb NOT NULL must be passed as sql.json(value) …` |
| non-literal SQL | `the SQL text is not a string literal: …` |

## Wrong arguments

A wrong positional argument is an ordinary TypeScript error on that argument:

```ts
sql("SELECT id FROM users WHERE id = $1", "7");
// Argument of type 'string' is not assignable to parameter of type 'number'.
```

A raw array passed to a JSON parameter fails with `… parameter of type 'NonArrayOrSqlJson<Item[]>'`. Pass `sql.json(value)` instead; see [JSON values](./parameters#json-values).

A statement that does not validate accepts any arguments, so its `SqlError` is the only error on the call.

## Long statements

TypeScript shortens long types in error messages (a `…` after a few hundred characters), which can cut off the SQL text. The `SqlError` comes first so it stays visible, and the second line of the error repeats it:

```
Argument of type 'string' is not assignable to parameter of type 'SqlError<"parameter $6: a
  string[] value cannot be used as timestamptz[] NOT NULL", 63> & "INSERT INTO …'.
  Type 'string' is not assignable to type 'SqlError<"parameter $6: …", 63>'.
```

::: tip
Set `"noErrorTruncation": true` in `tsconfig.json` to see the whole statement.
:::

`Argument of type 'string'` appears for template literals with `${sql.param(…)}`, because TypeScript prints the template's widened type in the message. The text was still analysed, and the `SqlError` is the real error.

## When TypeSQL can't type a statement

Use `sql.as<Row>(text, …)`. It skips inference and takes the row type you give it:

<<< @/snippets/errors.ts#as

Use it for SQL that TypeSQL does not support or cannot type (here, a `FETCH` from a cursor declared in another statement), and for SQL it cannot see at compile time ([dynamic SQL](./dynamic-sql)). It accepts slots, `:name` and inline parameters, like `sql()`. With `rowKeys: "camelCase"`, write the row with camelCase keys.

Unsupported syntax is always a compile error, never a silent `any`. See [Limits](./limits).

## Exporting queries from another package (TS2883)

With `declaration` output, TypeScript 7.1 checks that every inferred type can be named from the package that exports it. Rows are plain object types, but a `Query`, `Fragment` or `Migrations` value is a TypeSQL type. A package that exports one without depending on `@typesql/core` itself fails:

```
error TS2883: The inferred type of 'userQuery' cannot be named without a reference to 'Query'
  from '../../shared/node_modules/@typesql/core/dist'. This is likely not portable.
```

Any of these fixes it:

- Re-export TypeSQL's types from the module that calls `createSql`. TypeScript then names them through that module:
  ```ts
  export const sql = createSql<DB>(executor);
  export type * from "@typesql/core";
  ```
- Add `@typesql/core` to the exporting package's `dependencies`.
- Export the rows (`execute*` results) instead of the query, or annotate the return type.
