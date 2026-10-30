# Parameters

Values are always sent as parameters, never pasted into the SQL. You can write them in three ways, and in all three the parameter's type comes from where it is used.

| Style | Example | Values |
|---|---|---|
| Positional | `WHERE id = $1` | arguments after the SQL |
| Named | `WHERE id = :id` | one object |
| Inline | ``WHERE id = ${sql.param(id)}`` | written in the SQL template |

## Positional: `$1`, `$2`, …

The SQL is sent as written, and the values follow it as arguments:

```ts
const byId = sql(
	"SELECT id, email FROM users WHERE id = $1 AND created_at > $2",
	7,
	new Date(),
);
```

A wrong argument is a normal TypeScript error:

```ts
sql("SELECT id FROM users WHERE id = $1", "7");
```

## Named: `:name`

The call takes one object. TypeSQL rewrites the names to `$1`, `$2`, … in order of first use. A name used twice is one parameter.

```ts
const byEmail = sql(
	"SELECT id FROM users WHERE email = :email OR display_name = :email",
	{ email: "a@b.c" },
);
byEmail.text;
```

Only a colon directly followed by a name is one: `::` casts, `:=`, `: v` and colons inside strings, comments and dollar-quoted strings are not parameters. You can't mix `:name` and `$n` in one statement.

## Inline: `${sql.param(value)}`

Write the value where it is used. `sql.param()` turns it into a `$n` parameter. The value never becomes part of the SQL text, so hostile input stays harmless.

```ts
const inline = sql(
	`SELECT id, email FROM users WHERE id = ${sql.param(userId)} AND email <> ${sql.param(email)}`,
);
inline.text;
inline.values;
```

The value's TypeScript type is checked against the parameter's type. A mismatch is a compile error that names the parameter:

```ts
sql(`SELECT id FROM users WHERE id = ${sql.param("7")}`);

sql(`INSERT INTO users (email) VALUES (${sql.param(maybeEmail  )})`);
```

Strings are accepted for enum columns, and any object for JSON and other object-typed columns (arrays for JSON go through [`sql.json()`](#json-values)). With no context (`SELECT ${sql.param(x)}`), anything is accepted. `sql.param()` inside quotes or a comment is an error.

`sql.param(undefined)` is rejected. Use `sql.param(value ?? sql.empty)` or `sql.param(sql.empty(value))` to request `DEFAULT` for a nullish value. Such a value is only accepted where `DEFAULT` is. Pass `null` directly to bind SQL `NULL`. See [Inserting and updating](./writing-data#optional-values).

::: warning One statement per value
A `sql.param()` value belongs to one statement. Using the same value in a second statement throws at runtime. To reuse a value, wrap it in a [fragment](./dynamic-sql), which can be spliced any number of times.
:::

Inline values mix with the other two styles: `$n` and `:name` parameters keep `$1…$k`, inline values are numbered after them, and values carried by [fragments](./dynamic-sql) come last.

## A value used more than once

Each `${sql.param(x)}` is its own `$n`, even for the same `x`. The value is sent once per use, and each use is checked on its own.

To send a value once and use it in several places, write it as a `:name` (or a `$n`). It is then one parameter, and its type must fit every use:

```ts
const optional = sql(
	"SELECT id FROM users WHERE (:name::text IS NULL OR display_name = :name)",
	{ name },
);
optional.text;
```

## JSON values

Use `${sql.json(value)}` for `json` and `jsonb` values. It sends the same JSON text with both drivers, and sends `null` or `undefined` as SQL `NULL`.

```ts
const save = sql(
	`UPDATE portfolio SET history = ${sql.json(history)} WHERE id = ${sql.param(1)}`,
);
```

Why not a raw value? node-postgres sends a JS array as a Postgres array literal, which Postgres rejects as JSON, and postgres.js runs `JSON.stringify` on every value, so a string you already stringified is stored as a JSON string.

`sql.json()` is accepted only where a `json` or `jsonb` value is expected, or with no context (`SELECT ${sql.json(v)}::jsonb`). For a [`Json<T>` column](./schema#typed-json-columns), only the value's JSON kind is checked (an object, an array, a string, …), not its shape against `T`. Passing a raw array with `sql.param()` is an error:

```ts
sql(`UPDATE portfolio SET name = ${sql.json({ a: 1 })}`);

sql(`UPDATE portfolio SET history = ${sql.param(items)}`);
```

Positional and named JSON parameters don't take a raw array either. Pass `sql.json(value)` as the argument. Objects work as they are on PostgreSQL. A plain string goes to the driver unchanged: node-postgres sends it as JSON text, so `"hello"` fails as invalid JSON, while postgres.js stores it as a JSON string. Wrap strings in `sql.json()` to get a JSON string on every driver:

```ts
sql("UPDATE portfolio SET history = $1 WHERE id = $2", sql.json(items), 1);
sql("UPDATE portfolio SET history = :history WHERE id = :id", { history: sql.json(items), id: 1 });

sql("UPDATE portfolio SET history = $1", items);
```

As an argument too, `sql.json(value)` is only checked to be JSON of the right kind, not against `T`; see [Limits](./limits). Pass a raw object as a positional or named argument to have it checked against `T`.

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

```ts
sql("SELECT id FROM users WHERE id = ANY($1)", ids);
sql("SELECT id FROM users LIMIT $1 OFFSET $2", 10, 20);
sql(
	"INSERT INTO users (email, display_name, mood) VALUES ($1, $2, $3)",
	"a@b.c",
	null,
	"happy",
);
sql("SELECT lower($1) AS l", "ABC");
sql("SELECT $1::int4 + 1 AS n", 41);
sql("SELECT $1 AS anything", { any: "value" });
sql("SELECT v FROM unnest($1::text[]) AS t(v)", ["a", null]);
```

### When `null` is allowed

`null` is accepted wherever Postgres accepts it: `col = NULL` is legal and matches no row, and `LIMIT NULL` means no limit. It is rejected only when assigned to a `NOT NULL` column (`VALUES`, `SET`). A parameter used in several places accepts `null` only if every use does, so `UPDATE t SET label = $1 WHERE label <> $1` rejects `null` for a `NOT NULL` `label`.

Array elements always accept `null`: an `int4[]` parameter takes `(number | null)[]`, so `unnest($1::float8[])` works for bulk inserts with nullable values.

### What a parameter accepts

A parameter accepts the TypeScript type of a result column of its type, plus whatever the driver can send for that type. Under node-postgres, `int8` rows are strings, but `int8` parameters also take a `number` or `bigint`:

```ts
const post = sql("SELECT id FROM posts WHERE id = $1", 42);
sql("SELECT author_id FROM posts GROUP BY author_id HAVING count(*) >= $1", 3n);
sql("SELECT id FROM users WHERE created_at > $1", "2024-01-01T00:00:00Z");
```

The full list for each driver is in [Type mapping](../reference/type-mapping#parameter-types).

## Only literal SQL is analysed

The SQL must be a string literal, or a template literal whose `${…}` parts are compile-time constants. TypeScript folds those into the literal:

```ts
const table = "users";
const limit = 10;
const fromConsts = sql(`SELECT id FROM ${table} LIMIT ${limit}`);
fromConsts.text;
```

Anything else is rejected, so a value can't end up in the SQL text by accident:

```ts
sql(`SELECT id FROM users WHERE email = '${userInput}'`);
```

Tagged templates (`` sql`…` ``) are not supported. TypeScript doesn't give the type system the text of a tagged template, so nothing could be inferred from it.
