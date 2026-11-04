---
description: "Transform TypeSQL inputs and rows with sql.withPlugin, and write your own typed plugin with SqlPlugin."
---

# Plugins

`sql.withPlugin(plugin)` returns a new SQL instance; the original is unchanged. Plugins can change input and output structures and types. Register them in the order you want database rows transformed. Inputs travel through the inverse order: `sql.withPlugin(a).withPlugin(b)` decodes rows through `a` then `b`, and encodes application inputs through `b` then `a`.

TypeSQL ships [`CasePlugin`](./case-plugin) for camelCase keys. You can also write your own.

## Writing a plugin

A plugin implements `SqlPlugin<Types>` from `@typesql/core`. Its optional runtime hooks are synchronous:

- `transformInput(value, context)`: converts application input to database input. `context.kind` is `"set"` or `"values"` for each write object (`context.table` identifies the destination, or is `null` for `sql.set(values)` and `sql.values(rows)`), `"parameters"` for the entire argument array (`context.query` is the original SQL), or `"value"` for `sql.param(value)`.
- `transformOutput(row)`: converts one database row to the application result. It runs for `execute()`, `executeTakeFirst()`, `executeTakeFirstOrThrow()` and `mapRows()`. Counts and missing rows are unaffected.

Parameter input includes positional arguments or a single named-parameter object. It excludes interpolated fragments. The encoded result must be an array; named SQL still expects a single object in that array. A write object's encoded result must be a column-value object. Fragments and write helpers encode their values when created; placing them in another query does not encode those values again. `sql.json()` remains an explicit JSON marker; plugins should leave markers and nested JSON intact unless their contract intentionally converts them.

`Types` extends `PluginTypes` (or `IdentityPluginTypes` for identity defaults) and uses `this["value"]` and `this["context"]` to define three type functions:

| Property | Direction |
|---|---|
| `input` | Expected database input → accepted application input |
| `encoded` | Actual application input → actual database input |
| `output` | Inferred database row → returned application row |

Declare `readonly types?: Types` with `declare` in a class; it has no runtime value. Type functions must describe the runtime hooks accurately. For example, an output wrapper can be defined as:

```ts
import type { IdentityPluginTypes, SqlPlugin } from "@typesql/core";

type Wrapped<T> = { data: T };
interface WrappedTypes extends IdentityPluginTypes {
  readonly output: Wrapped<this["value"]>;
}
class WrappedPlugin implements SqlPlugin<WrappedTypes> {
  declare readonly types?: WrappedTypes;
  transformOutput(row: unknown): unknown {
    return { data: row };
  }
}

const wrapped = sql.withPlugin(new WrappedPlugin());
const row = await wrapped("SELECT display_name FROM users")
  .executeTakeFirstOrThrow();
// row.data.display_name is string | null.
```

For an example that transforms writes, parameter tuples and results together, see [`examples/plugins.ts`](https://github.com/ismailkarsli/TypeSQL/blob/main/packages/core/examples/plugins.ts). `sql.as<Row>()` continues to assert the **final** application row type. `RowType<typeof query>` reflects plugins; the engine's `RowOf` remains the database row type.
