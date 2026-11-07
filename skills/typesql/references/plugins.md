# Plugins

## CasePlugin

```ts
import { CasePlugin } from "@typesql/core/plugins";

const camel = sql.withPlugin(new CasePlugin());
const row = await camel("SELECT id, display_name FROM users").executeTakeFirstOrThrow(); // row.displayName
await camel(`UPDATE users SET ${camel.set("users", { displayName: "Ada" })} WHERE id = ${camel.param(7)}`).execute();
```

SQL keeps database names; rows and write objects are renamed.

- `{ to: "snake_case" }` reverses it, for camelCase columns.
- `nested` renames inside JSON: `"output"`, `"input"` or `"all"`. Older versions take `true`; check `CasePluginOptions`. Call arguments and JSON text aren't converted, and every key converts, even data keys.
- Turn off driver renaming (`postgres.camel`).
- `sql.as<Row>` takes renamed keys.
- Two columns mapping to one key: alias one.
- Irreversible names (`address_line_1`) keep their own name as a write key.

## Custom

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
```

Hooks are synchronous: `transformInput(value, context)`, `transformOutput(row)`, `transformJson(value)`. Type functions (`input`, `encoded`, `output`, `json`) must match the hooks; nothing checks them. Rows pass through plugins in registration order, inputs in reverse.
