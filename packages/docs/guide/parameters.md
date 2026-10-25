# Parameters

Values are always sent as parameters, never pasted into the SQL. You can write them in three ways, and in all three the parameter's type comes from where it is used.

| Style | Example | Values |
|---|---|---|
| Positional | `WHERE id = $1` | arguments after the SQL |
| Named | `WHERE id = :id` | one object |
| Inline | ``WHERE id = ${sql.param(id)}`` | written in the SQL template |

## Positional: `$1`, `$2`, …

The SQL is sent as written, and the values follow it as arguments:

<<< @/snippets/parameters.ts#positional

A wrong argument is a normal TypeScript error:

```ts
sql("SELECT id FROM users WHERE id = $1", "7");
// Argument of type 'string' is not assignable to parameter of type 'number'.
```

## Named: `:name`

The call takes one object. TypeSQL rewrites the names to `$1`, `$2`, … in order of first use. A name used twice is one parameter.

<<< @/snippets/parameters.ts#named

Only a colon directly followed by a name is one: `::` casts, `:=`, `: v` and colons inside strings, comments and dollar-quoted strings are not parameters. You can't mix `:name` and `$n` in one statement.

## Inline: `${sql.param(value)}`

Write the value where it is used. `sql.param()` turns it into a `$n` parameter. The value never becomes part of the SQL text, so hostile input stays harmless.

<<< @/snippets/parameters.ts#inline

The value's TypeScript type is checked against the parameter's type. A mismatch is a compile error that names the parameter:

```ts
sql(`SELECT id FROM users WHERE id = ${sql.param("7")}`);
// … SqlError<"parameter $1: a string value cannot be used as int4", 7>

sql(`INSERT INTO users (email) VALUES (${sql.param(maybeEmail /* string | null */)})`);
// … SqlError<"parameter $1: a string | null value cannot be used as text NOT NULL", 8>
```

Strings are accepted for enum columns, and any object for JSON and other object-typed columns (arrays for JSON go through [`sql.json()`](#json-values)). With no context (`SELECT ${sql.param(x)}`), anything is accepted. `sql.param()` inside quotes or a comment is an error.

A value that is `undefined` is sent as `DEFAULT`, and one that can be `undefined` is only accepted where `DEFAULT` is. See [Inserting and updating](./writing-data#optional-values).

::: warning One statement per value
A `sql.param()` value belongs to one statement. Using the same value in a second statement throws at runtime. To reuse a value, wrap it in a [fragment](./dynamic-sql), which can be spliced any number of times.
:::

Inline values mix with the other two styles: `$n` and `:name` parameters keep `$1…$k`, inline values are numbered after them, and values carried by [fragments](./dynamic-sql) come last.

## A value used more than once

Each `${sql.param(x)}` is its own `$n`, even for the same `x`. The value is sent once per use, and each use is checked on its own.

To send a value once and use it in several places, write it as a `:name` (or a `$n`). It is then one parameter, and its type must fit every use:

<<< @/snippets/parameters.ts#repeated

## JSON values

Use `${sql.json(value)}` for `json` and `jsonb` values. It sends the same JSON text with both drivers, and sends `null` or `undefined` as SQL `NULL`.

<<< @/snippets/json.ts#write

Why not a raw value? node-postgres sends a JS array as a Postgres array literal, which Postgres rejects as JSON, and postgres.js runs `JSON.stringify` on every value, so a string you already stringified is stored as a JSON string.

`sql.json()` is accepted only where a `json` or `jsonb` value is expected, or with no context (`SELECT ${sql.json(v)}::jsonb`). For a [`Json<T>` column](./schema#typed-json-columns), the value is checked against `T`. Passing a raw array with `sql.param()` is an error:

```ts
sql(`UPDATE portfolio SET name = ${sql.json({ a: 1 })}`);
// … SqlError<"parameter $1: a sql.json() value cannot be used as text NOT NULL", 5>

sql(`UPDATE portfolio SET history = ${sql.param(items)}`);
// … SqlError<"parameter $1: an array for jsonb NOT NULL must be passed as sql.json(value)
//    (node-postgres sends a JS array as a Postgres array)", 5>
```

Positional and named JSON parameters don't take a raw array either. Pass `sql.json(value)` as the argument. Objects and other values work as they are:

```ts
sql("UPDATE portfolio SET history = $1 WHERE id = $2", sql.json(items), 1);
sql("UPDATE portfolio SET history = :history WHERE id = :id", { history: sql.json(items), id: 1 });

sql("UPDATE portfolio SET history = $1", items);
// Argument of type 'HistoryItem[]' is not assignable to parameter of type 'NonArrayOrSqlJson<HistoryItem[]>'.
```

As an argument, `sql.json(value)` is only checked to be JSON, not against `T`; see [Limits](./limits).

## How parameters get their types

| Where the parameter is | Its type |
|---|---|
| `col = $1`, `col > $1`, `$1 = col`, `col IS DISTINCT FROM $1` | the column's type, `\| null` |
| `col LIKE $1`, `col ~ $1` | `text \| null` |
| `col + $1`, `col \|\| $1` | the other operand's type and nullability |
| `INSERT … VALUES ($1)`, `UPDATE … SET col = $1` | the column's type, `\| null` if the column is nullable |
| `col IN ($1, $2)`, `$1 BETWEEN a AND b` | the column's type for each, `\| null` |
| `col = ANY($1)` | an array of the column's type, `\| null` |
| `LIMIT $1`, `OFFSET $1` | `number \| null` |
| a function argument | the function's parameter type, `\| null` |
| `$1::T` | `T` (a cast wins over context), nullable as the context is; non-null without context |
| `$1 IS NULL`, `$1::T IS NOT NULL` | adds `\| null` to the type the other uses give |
| anywhere else | `unknown` |

<<< @/snippets/parameters.ts#contexts

### When `null` is allowed

`null` is accepted wherever Postgres accepts it: `col = NULL` is legal and matches no row, and `LIMIT NULL` means no limit. It is rejected only when assigned to a `NOT NULL` column (`VALUES`, `SET`). A parameter used in several places accepts `null` only if every use does, so `UPDATE t SET label = $1 WHERE label <> $1` rejects `null` for a `NOT NULL` `label`.

Array elements always accept `null`: an `int4[]` parameter takes `(number | null)[]`, so `unnest($1::float8[])` works for bulk inserts with nullable values.

### What a parameter accepts

A parameter accepts the TypeScript type of a result column of its type, plus whatever the driver can send for that type. Under node-postgres, `int8` rows are strings, but `int8` parameters also take a `number` or `bigint`:

<<< @/snippets/parameters.ts#inputs

The full list for each driver is in [Type mapping](../reference/type-mapping#parameter-types).

## Only literal SQL is analysed

The SQL must be a string literal, or a template literal whose `${…}` parts are compile-time constants. TypeScript folds those into the literal:

<<< @/snippets/parameters.ts#constants

Anything else is rejected, so a value can't end up in the SQL text by accident:

```ts
sql(`SELECT id FROM users WHERE email = '${userInput}'`);
// … SqlError<"the SQL text is not a string literal: pass values as parameters ($1, :name or
//    ${sql.param(value)}), identifiers with sql.id(), reusable pieces as {slot} fragments,
//    or use sql.as<Row>() for dynamic SQL", 0>
```

Tagged templates (`` sql`…` ``) are not supported. TypeScript doesn't give the type system the text of a tagged template, so nothing could be inferred from it.
