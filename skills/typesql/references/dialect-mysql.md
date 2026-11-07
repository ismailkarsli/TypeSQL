# MySQL and MariaDB dialects

Use `mysql` for MySQL, Aurora, PlanetScale and TiDB; `mariadb` for MariaDB and SkySQL.

```ts
import type { Col, Enum, Json, Sig, Typed, View } from "@typesql/core/mysql";

export interface DB {
	users: {
		id: Col<"int unsigned", { autoIncrement: true }>; // lower case, no lengths
		email: Col<"varchar">;
		display_name: Col<"varchar", { nullable: true }>;
		role: Enum<"admin" | "member", { hasDefault: true }>;
	};
	posts: { id: Col<"bigint unsigned", { autoIncrement: true }>; author_id: Col<"int unsigned">; title: Col<"varchar">; kind: Col<Typed<"varchar", "note" | "link">>; meta: Json<{ views: number }, { nullable: true }> };
	user_stats: View<{ user_id: Col<"int unsigned"> }>;
	$functions: { slugify: Sig<["varchar"], "varchar"> };
}
```

Other flags: `position`, `generated`, `hidden`.

Generate: `typesql introspect --url mysql://… --out src/db/schema.ts` (`@typesql/cli`, `mysql2`). The URL scheme picks the dialect.

- **Lists:** build with fragments; an empty list throws, so check first:
  ```ts
  sql(`SELECT id FROM users WHERE id IN (${sql.combine(ids.map((id) => sql.fragment(`${sql.param(id)}`)))})`);
  ```
- **Inserted id on MySQL:** no `RETURNING`. On a pool, read it in a transaction:
  ```ts
  const { id } = await sql.transaction(async (tx) => {
  	await tx(`INSERT INTO users (email) VALUES (${tx.param("a@b.c")})`).execute();
  	return tx("SELECT LAST_INSERT_ID() AS id").executeTakeFirstOrThrow();
  });
  ```
- **Upsert:** `ON DUPLICATE KEY UPDATE title = VALUES(title)`.
- **Quoting:** backticks for names; `"…"` is a string.
- **Types:** `/` and `SUM` are `decimal`; comparisons are `0`/`1`.
- **Nullable:** `/`, `DIV`, `%` unless the divisor is a nonzero literal; date functions on strings; aggregates without `GROUP BY` except `COUNT`.
- **Names:** alias every expression; unaliased ones keep trailing whitespace on MySQL or embed values.
- **JSON:** a parameter takes `sql.json(v)` or JSON text, not an object.
- **Strings:** write `''`, not `\'`, which confuses parameter rewriting.

| | MySQL | MariaDB |
|---|---|---|
| `RETURNING` | error | `INSERT`, `REPLACE`, `DELETE` |
| `->`, `->>` | yes | error; use `JSON_EXTRACT` |
| bare column, aggregate, no `GROUP BY` | error | nullable |
| integer literals | `bigint` | `int` when short |
| `VALUES ROW(…)`, `TABLE t`, `LATERAL`, `AS new` | yes | error |
| query as `VALUES (…)` | error | yes |
