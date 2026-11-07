# PostgreSQL dialect

```ts
import type { Col, Enum, Json, Sig, View } from "@typesql/core/postgres";

export interface DB {
	users: {
		id: Col<"int4", { hasDefault: true }>; // optional in INSERT
		email: Col<"text">;
		display_name: Col<"text", { nullable: true }>;
		mood: Enum<"mood", { hasDefault: true }>;
		settings: Json<{ theme: "dark" | "light" }, { nullable: true }>; // jsonb; third arg "json"
	};
	posts: { id: Col<"int8", { hasDefault: true }>; author_id: Col<"int4">; title: Col<"text">; tags: Col<"text[]"> };
	user_stats: View<{ user_id: Col<"int4"> }>; // read-only
	auth: { sessions: { token: Col<"uuid"> } }; // non-public schema
	$types: { mood: "happy" | "sad" };
	$functions: { slugify: Sig<["text"], "text"> }; // required for unknown functions
}
```

Generate: `typesql introspect --url postgres://… --out src/db/schema.ts` (`@typesql/cli`, `pg`). Options: `--schema`, `--exclude`, `--config` (a `columnTypes` map types JSON columns). Catalogs: `createSql<DB & PgCatalog>`.

- **Lists:** `` `id = ANY(${sql.param(ids)})` ``, safe when empty.
- **Upsert:** `ON CONFLICT (email) DO UPDATE SET x = EXCLUDED.x`.
- **Unaliased names:** `?column?`, `lower`, `count`; duplicates: last wins.
- **Types:** `count(*)` and `sum(int4)` are `int8`; cast with `::int` for a number.
- **JSON:** `json_build_object`, `json_agg` and `->` are typed with literal keys. `jsonb_set`, `||`, `json_each` etc. return plain JSON. Next to typed JSON, only `'[]'`, `'{}'`, `'null'`, `'true'`, `'false'` keep their value.
- **Colons:** `a[1:n]` reads `:n` as a parameter; write `a[1: n]`.
- **Not checked:** aggregate `ORDER BY`, window frames, `GROUPING SETS`, writes to `GENERATED ALWAYS`.
- **Arrays:** typed one-dimensional, with non-null elements from columns.
