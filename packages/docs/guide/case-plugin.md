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

Every capital becomes `_` and its lower case, so alias a column whose name doesn't suit that.

| Column | Key |
|---|---|
| `displayName` | `display_name` |
| `addressLine1` | `address_line1` |
| `userID` | `user_i_d` |
| `Id` | `_id` |
| `display_name`, `count` | unchanged |

### `nested`

With `nested: true`, the keys inside values convert too, at any depth, through plain objects and arrays. It covers `json` and `jsonb` columns, and any other value that is a plain object. A `Date`, `Buffer` or class instance stays as it is.

```ts
const camel = sql.withPlugin(new CasePlugin({ nested: true }));

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

Writes convert in `sql.json()`, `sql.param()`, and the values of `sql.set()` and `sql.values()`, and each is checked against the `Json<T>` of its column. Use the same plugin's `sql.json()`: one from an `sql` without the option keeps its keys.

- Call arguments such as `camel("UPDATE users SET profile = $1", value)` are not converted, because an object there can also hold named parameters. Wrap the value in `sql.json()`, or use the database's keys.
- Text isn't parsed. Where a driver returns JSON as a string, as the SQLite drivers do, the row's value stays that string with the database's keys.
- Every key converts, including ones that are data: `{ "user_id_1": … }` in a `{ [key: string]: T }` value reads as `{ "userId1": … }`, and that key writes back as `user_id1`. Keep such a value out of a `nested` plugin, or read it as text (`doc::text`).
- The mapping isn't always reversible: `address_line_1` reads as `addressLine1`, as for columns. `sql.json()` then takes it as `address_line_1`.

## Things to know

- Without `nested`, only top-level result and write-object keys are renamed, and keys inside `json` and `jsonb` values stay unchanged. Named parameter names never change.
- If two columns map to the same key (`user_id` and `"userId"`), the later one wins at runtime and the type is the union of both. Alias one of them to keep both.
- `sql.as<Row>()` takes the row as returned, so give it the renamed keys.
- `RowOf<DB, TM, Q>` still uses the database's names. `RowType<typeof q>` is the renamed row.
- All adapters support `.withPlugin(new CasePlugin())`, and transactions retain the plugins, including nested transactions.
- `sql.set()` and `sql.values()` accept camelCase objects and encode conventional snake_case column names. A column whose camelCase name wouldn't convert back to it, such as `address_line_1` (`addressLine1` would become `address_line1`), takes its own snake_case name as the key. Use the original SQL instance for other snake_case write objects or quoted mixed-case database columns. With `to: "snake_case"` the same holds the other way round: `HTTPCode` takes its own name as the key, and a `lower_name` column needs the original SQL instance to be written.
- Turn off renaming in the driver, such as postgres.js' `transform: postgres.camel`. The types assume the driver returns the database's names. `@typesql/kysely` already bypasses Kysely plugins such as `CamelCasePlugin`.
