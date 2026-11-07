# SQLite dialect

```ts
import type { Col, Json, Sig, Typed, View } from "@typesql/core/sqlite";

export interface DB {
	users: {
		id: Col<"integer", { hasDefault: true; rowid: true }>;
		email: Col<"text">;
		display_name: Col<"text", { nullable: true }>;
		mood: Col<Typed<"text", "happy" | "sad">, { hasDefault: true }>; // no enums
	};
	posts: { id: Col<"integer", { hasDefault: true }>; author_id: Col<"integer">; title: Col<"text">; meta: Json<{ views: number }, { nullable: true }> };
	user_stats: View<{ user_id: Col<"integer"> }>;
	$functions: { slugify: Sig<["text"], "text"> }; // also register with the driver
}
```

Other flags: `position` (order for `SELECT *`), `generated`, `hidden`. Declared names set affinity.

Generate: `typesql introspect --db app.db --out src/db/schema.ts` (`@typesql/cli`). It records `position`, so `SELECT *` is exact.

- **Lists:** `` `id IN (SELECT value FROM json_each(${sql.json(ids)}))` ``, safe when empty.
- **Inserted id:** `RETURNING id`.
- **`sql.values`:** every row needs the same keys; no `DEFAULT` in `VALUES`.
- **Unaliased names:** the expression text, such as `count(*)`.
- **Nullable:** division, math and date functions, `json_extract`, aggregates without `GROUP BY`.
- **JSON:** the column reads as text; `->`, `->>`, `json_extract` with constant paths are typed from `T`.
- **Values:** `boolean` reads as a number, dates as strings. A `Date` parameter throws; use `toISOString()`.
