# Parameters

Values are always sent as parameters, never pasted into the SQL. There are three ways to
write them, and in all three the parameter's type comes from where it is used.

## Positional: `$1`, `$2`, …

The SQL text is sent as written; the values follow the text as arguments.

<<< @/snippets/parameters.ts#positional

## Named: `:name`

Named parameters are rewritten to `$n` in order of first appearance; the call takes one
object. A name used twice is one parameter. `::` casts and colons inside strings are left
alone.

<<< @/snippets/parameters.ts#named

## Inline: `${sql.param(value)}`

Write the value where it is used. `sql.param()` turns it into a `$n` parameter; it never
becomes part of the text, so hostile input stays harmless.

<<< @/snippets/parameters.ts#inline

The value's TypeScript type is checked against the parameter's type, and a mismatch is a
compile error naming the parameter:

```ts
sql(`SELECT id FROM users WHERE id = ${sql.param("7")}`);
// … SqlError<"parameter $1: a string value cannot be used as int4 NOT NULL", 7>

sql(`INSERT INTO users (email) VALUES (${sql.param(maybeEmail /* string | null */)})`);
// … SqlError<"parameter $1: a string | null value cannot be used as text NOT NULL", 8>
```

Strings are accepted for enum columns, and any object for JSON and other object-typed columns.
With no context (`SELECT ${sql.param(x)}`) anything is accepted.

Inline parameters mix with the other two styles: `$n` and `:name` parameters keep `$1…$k` and
are passed as arguments, inline values are numbered after them, and values carried by
[fragments](./fragments) come last.

A `sql.param()` value can be created ahead of time, but it belongs to one statement: using
the same value in a second statement throws at runtime. Wrap a value you want to reuse in a
[fragment](./fragments), which can be spliced any number of times. `sql.param()` inside quotes
or a comment is an error.

## How parameters get their types

| Context | Parameter type |
|---|---|
| `col = $1`, `col > $1`, `$1 = col` | the column's type, non-null |
| `col LIKE $1`, `col ~ $1` | `text`, non-null |
| `col + $1`, `col \|\| $1` | the other operand's type and nullability |
| `INSERT … VALUES ($1)`, `UPDATE … SET col = $1` | the column's type, with `\| null` if the column is nullable |
| `col IN ($1, $2)` | the column's type for each |
| `col = ANY($1)` | an array of the column's type |
| `LIMIT $1`, `OFFSET $1` | `number` |
| a function argument | the function's parameter type |
| `$1::T` | `T` (a cast wins over context) |
| `$1 IS NULL`, `$1::T IS NOT NULL` | adds `\| null` to the type the other uses give |
| anywhere else | `unknown` |

<<< @/snippets/parameters.ts#contexts

The TypeScript type of a parameter is the same as for a result column of that type, so under
the node-postgres map an `int8` parameter takes a `string`. Cast the parameter to compare with
a number:

<<< @/snippets/parameters.ts#int8

## Only literal SQL is analysed

The SQL text must be a string literal, or a template literal whose substitutions are
compile-time constants (TypeScript folds those into the literal):

<<< @/snippets/parameters.ts#constants

Anything else is rejected, so a value cannot end up in the SQL text by accident:

```ts
sql(`SELECT id FROM users WHERE email = '${userInput}'`);
// … SqlError<"the SQL text is not a string literal: pass values as parameters ($1, :name or
//    ${sql.param(value)}), identifiers with sql.id(), reusable pieces as {slot} fragments,
//    or use sql.as<Row>() for dynamic SQL", 0>
```

Tagged templates (`` sql`…` ``) are not supported: TypeScript does not expose the text of a
tagged template to the type system, so nothing could be inferred from it.
