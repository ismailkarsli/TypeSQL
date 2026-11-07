# SQLite drivers

`pnpm add @typesql/core @typesql/sqlite`, plus better-sqlite3 if used.

```ts
import { DatabaseSync } from "node:sqlite";
import { createSql } from "@typesql/sqlite";
import type { DB } from "./db/schema.js";

const sql = createSql<DB>(new DatabaseSync("app.db"));
```

A better-sqlite3 or bun:sqlite `Database` works the same. `execute*` is still async.

**Rows:**
- `number`: integer, real and numeric affinity, so `count(*)`.
- `string`: text, `date`, `datetime`, `json`.
- `Uint8Array`: `blob`.
- node:sqlite rows have a null prototype.
- Beyond `MAX_SAFE_INTEGER`, pass `createSql<DB>(db, { bigint: true })`.

**Parameters:** booleans are sent as `1`/`0`. bun:sqlite binds non-whole numbers as REAL, so pass a `bigint` for integer arithmetic.

**Transactions:** the database is one connection, so a second top-level `sql.transaction()` while one is open rejects.
