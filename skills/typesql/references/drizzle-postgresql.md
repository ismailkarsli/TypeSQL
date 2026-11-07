# Drizzle on PostgreSQL

Only node-postgres and postgres.js databases. Pass the driver's map:

```ts
import { postgres } from "@typesql/core/postgres";
import { createSql } from "@typesql/drizzle";
import type { PgTypeMap } from "@typesql/pg";

const sql = createSql<typeof schema, PgTypeMap>(postgres, db);

await db.transaction(async (tx) => {
	await createSql<typeof schema, PgTypeMap>(postgres, tx)("DELETE FROM posts WHERE author_id = $1", 1).execute();
});
```

On postgres.js, use `PostgresJsTypeMap` from `@typesql/postgres`.

- `bigint({ mode: "number" })` is still `int8`, a `string` on `pg`.
- `.$type<T>()` is ignored: `jsonb().$type<T>()` reads `unknown`.
- `text({ enum })` is plain `text`.
- `pgEnum` is keyed by its export name; name the export after the SQL type.
- `timestamp()` loses `withTimezone`. Pin it with `pgType(timestamp("at", { withTimezone: true }).notNull(), "timestamptz")`, or set `{ timestamp: "timestamptz" }` as the third type argument.
