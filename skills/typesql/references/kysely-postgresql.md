# Kysely on PostgreSQL

`createSql(postgres, db)`, with `postgres` from `@typesql/core/postgres`.

**Read back as:**
- `number` is `int4`, `string` is `text`, `bigint` is `int8`.
- `Date` and `Timestamp` are `timestamptz`.
- Codegen's `Int8` and `Numeric` map directly.
- Objects are `jsonb`.
- A string-literal union is an enum.
- `"auth.users"` is a schema table.

**Exact `pg` rows:** `createSql<DB, PgTypeMap>(postgres, db)`.

**Overrides:**

```ts
import { type DefaultTypeMap, postgres } from "@typesql/core/postgres";
import { createSql } from "@typesql/kysely";

const pinned = createSql<DB, DefaultTypeMap, { posts: { score: "float8" }; $types: { mood: "happy" | "sad" } }>(postgres, db);
```

Declare shared enums in `$types`, or `UNION`s of them fail and `'x'::mood` is `unknown`. Arrays of enums stay raw `{…}` text; cast with `::text[]`.
