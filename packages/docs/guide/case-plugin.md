---
description: "Rename row and write keys between camelCase and snake_case with TypeSQL's CasePlugin, optionally inside JSON, with types and runtime values renamed together."
---

# CasePlugin

`CasePlugin` is a [plugin](./plugins) that gives you camelCase row keys and write input keys, or [snake_case ones](#to) for camelCase columns, and [renames keys inside JSON](#nested) if you ask. The inferred types and runtime values change together. SQL text and `sql.id()` keep the database's names.

::: code-group

```ts [PostgreSQL]
import { CasePlugin } from "@typesql/core/plugins";

const camel = createSql<DB>(postgres, executor).withPlugin(new CasePlugin());

const rows = await camel(
	"SELECT id, display_name, created_at, count(*) OVER () AS total_count FROM users",
).execute();
```

```ts [SQLite]
import { CasePlugin } from "@typesql/core/plugins";

const camel = createSql<DB>(sqlite, executor).withPlugin(new CasePlugin());

const rows = await camel(
	"SELECT id, display_name, created_at, count(*) OVER () AS total_count FROM users",
).execute();
```

```ts [MySQL]
import { CasePlugin } from "@typesql/core/plugins";

const camel = createSql<DB>(mysql, executor).withPlugin(new CasePlugin());

const rows = await camel(
	"SELECT id, display_name, created_at, count(*) OVER () AS total_count FROM users",
).execute();
```

:::

The mapping is the default of Kysely's `CamelCasePlugin`: the first character stays, every later `_` is dropped, and the character after a `_` becomes upper case.

| Column | Key |
|---|---|
| `created_at` | `createdAt` |
| `address_line_1` | `addressLine1` |
| `_private` | `_Private` |
| `a__b`, `trailing_` | `aB`, `trailing` |
| `HTTP_CODE` | `HTTPCODE` |
| `fooBar`, `?column?`, `count` | unchanged |

## Options

```ts
new CasePlugin({ to: "camelCase", nested: false }); // the defaults
```

### `to`

The case of your application's keys. With `to: "snake_case"`, a database with camelCase columns gives snake_case row keys and takes snake_case write keys:

```ts
const snake = sql.withPlugin(new CasePlugin({ to: "snake_case" }));

const row = await snake(
	`UPDATE accounts SET ${snake.set("accounts", { display_name: "Ada" })} WHERE id = 1 RETURNING "displayName", "createdAt"`,
).executeTakeFirstOrThrow();
// row is { display_name: string | null; created_at: Date }
```

A capital starts a new word and the first character takes no `_`. A run of capitals is one word, and a capital that ends a run before a lower case letter starts the next word. Alias a column whose name doesn't suit that.

| Column | Key |
|---|---|
| `displayName` | `display_name` |
| `addressLine1` | `address_line1` |
| `userID`, `fooBAR` | `user_id`, `foo_bar` |
| `HTTPCode`, `XMLHttpRequest` | `http_code`, `xml_http_request` |
| `Id` | `id` |
| `userIDs` | `user_i_ds` |
| `display_name`, `count` | unchanged |

### `nested`

With `nested`, the keys inside values convert too, at any depth, through plain objects and arrays. It covers `json` and `jsonb` columns, and any other value that is a plain object. A `Date`, `Buffer` or class instance stays as it is.

| `nested` | Rows | `sql.json()`, `sql.param()`, values of `sql.set()` and `sql.values()` |
|---|---|---|
| left out or `false` | as stored | as written |
| `"output"` | renamed | as written |
| `"input"` | as stored | renamed |
| `"all"` | renamed | renamed |

The types follow: a value that stays as written has the column's own `Json<T>` as its input type, and a row that stays as stored has `T`. Use `"output"` when you want camelCase rows but the stored keys are data your application chose, so that `{ SASA: 1, "SISE.IS": 2, startDate: "x" }` is stored as written and reads back the same.

```ts
const camel = sql.withPlugin(new CasePlugin({ nested: "all" }));

// profile is stored as {"home_city": "Oslo", "past_cities": [{"city_name": "Rome"}]}
const { profile } = await camel(
	"SELECT profile FROM users WHERE id = 1",
).executeTakeFirstOrThrow();
// profile is { homeCity: string; pastCities: { cityName: string }[] }

await camel(
	`UPDATE users SET ${camel.set("users", {
		profile: camel.json({ homeCity: "Lima", pastCities: [] }),
	})} WHERE id = 1`,
).execute();
// stored as {"home_city": "Lima", "past_cities": []}
```

With `"input"` or `"all"`, writes convert in `sql.json()`, `sql.param()`, and the values of `sql.set()` and `sql.values()`, and each is checked against the `Json<T>` of its column. Use the same plugin's `sql.json()`: one from an `sql` without the option keeps its keys.

- Call arguments are not converted, whether positional or named, such as `camel("UPDATE users SET profile = $1", value)` and `camel("UPDATE users SET profile = :doc", { doc: value })`, because an object there can also hold named parameters. The same value in `sql.param()` is converted, so the stored keys depend on how you pass it. Wrap the value in `sql.json()`, or use the database's keys.
- A write throws when two keys of one object convert to the same key, such as `{ SASA: 1, sasa: 2 }`, because one value would be lost. That holds for `sql.set()` and `sql.values()` columns in every mode, and for keys inside values with `"input"` or `"all"`.
- A type that takes every JSON value, such as `string | number | boolean | null | JSONType[] | { [key: string]: JSONType }`, stays that type, because it says nothing about its keys. They still convert at runtime.
- Text isn't parsed. Where a driver returns JSON as a string, as the SQLite drivers do, the row's value stays that string with the database's keys.
- Every key converts, including ones that are data: `{ "user_id_1": … }` in a `{ [key: string]: T }` value reads as `{ "userId1": … }`, and that key writes back as `user_id1`. Keep such a value out of a `nested` plugin, or read it as text (`doc::text`).
- The mapping isn't always reversible: `address_line_1` reads as `addressLine1`, as for columns. `sql.json()` then takes it as `address_line_1`.

## Things to know

- Without `nested`, only top-level result and write-object keys are renamed, and keys inside `json` and `jsonb` values stay unchanged. Named parameter names never change.
- If two columns map to the same key (`user_id` and `"userId"`), the later one wins at runtime and the type is the union of both. Alias one of them to keep both.
- `sql.as<Row>()` takes the row as returned, so give it the renamed keys.
- `RowOf<DB, TM, Q>` still uses the database's names. `RowType<typeof q>` is the renamed row.
- All adapters support `.withPlugin(new CasePlugin())`, and transactions retain the plugins, including nested transactions.
- `sql.set()` and `sql.values()` accept camelCase objects and encode conventional snake_case column names. A column whose camelCase name wouldn't convert back to it, such as `address_line_1` (`addressLine1` would become `address_line1`), takes its own snake_case name as the key, and so does `point_x_y` (`pointXY` would become `point_xy`). Use the original SQL instance for other snake_case write objects or quoted mixed-case database columns. With `to: "snake_case"` the same holds the other way round: `HTTPCode` reads as `http_code`, `userID` as `user_id` and `Id2` as `id2`, but each takes its own name as the key, because `http_code` would become `httpCode`. A key that doesn't convert back is a compile error, since nothing at runtime knows the column it came from. A `lower_name` column needs the original SQL instance to be written.
- Turn off renaming in the driver, such as postgres.js' `transform: postgres.camel`. The types assume the driver returns the database's names. `@typesql/kysely` already bypasses Kysely plugins such as `CamelCasePlugin`.
