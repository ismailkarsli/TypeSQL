# mariadb connector

`pnpm add @typesql/core @typesql/mysql mariadb`

```ts
import { createPool } from "mariadb";
import { createSql } from "@typesql/mysql/mariadb";
import type { DB } from "./db/schema.js";

const sql = createSql<DB>(createPool(process.env["DATABASE_URL"]!));
```

Defaults to the `mariadb` dialect; pass `{ dialect: "mysql" }` for a MySQL server.

**Rows:**
- `bigint`: `bigint` columns and `count(*)`. `JSON.stringify` throws on it, so convert with `Number()`.
- `string`: `decimal` (`sum`, `avg`), text, `time`.
- `string[]`: `set`.
- `Date`: dates.
- `Uint8Array`: binary; `BIT(1)` is also `boolean`.
- `point` is GeoJSON.

**Prepared:** `sql.prepare` uses the binary protocol, where `FLOAT` widens.
