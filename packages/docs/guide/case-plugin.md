---
description: "Get camelCase row keys and write camelCase input objects with TypeSQL's CasePlugin, with types and runtime values renamed together."
---

# CasePlugin

`CasePlugin` is a [plugin](./plugins) that gives you camelCase row keys and write input keys. The inferred types and runtime values change together. SQL text and `sql.id()` keep the database's names.

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

## Things to know

- Only top-level result and write-object keys are renamed. Named parameter names and keys inside `json` and `jsonb` values stay unchanged.
- If two columns map to the same key (`user_id` and `"userId"`), the later one wins at runtime and the type is the union of both. Alias one of them to keep both.
- `sql.as<Row>()` takes the row as returned, so give it camelCase keys.
- `RowOf<DB, TM, Q>` still uses the database's names. `RowType<typeof q>` is the renamed row.
- All adapters support `.withPlugin(new CasePlugin())`, and transactions retain the plugins, including nested transactions.
- `sql.set()` and `sql.values()` accept camelCase objects and encode conventional snake_case column names. A column whose camelCase name wouldn't convert back to it, such as `address_line_1` (`addressLine1` would become `address_line1`), takes its own snake_case name as the key. Use the original SQL instance for other snake_case write objects or quoted mixed-case database columns.
- Turn off renaming in the driver, such as postgres.js' `transform: postgres.camel`. The types assume the driver returns the database's names. `@typesql/kysely` already bypasses Kysely plugins such as `CamelCasePlugin`.
