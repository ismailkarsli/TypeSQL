# mysql2

`pnpm add @typesql/core @typesql/mysql mysql2`

```ts
import { createPool } from "mysql2/promise";
import { createSql } from "@typesql/mysql";
import type { DB } from "./db/schema.js";

const sql = createSql<DB>(createPool(process.env["DATABASE_URL"]!));
```

Use `mysql2/promise`. On MariaDB, pass `{ dialect: "mariadb" }` as the second argument.

**Rows:**
- `number`: integers including `bigint` (`count(*)`, imprecise past 2^53), floats.
- `string`: `decimal` (`sum`, `avg`), text, `time`, `set`.
- `Date`: dates.
- `Uint8Array`: binary.

**Pool options need a matching map** as the second type argument, from `@typesql/core/mysql`:
- `supportBigNumbers` + `bigNumberStrings`: `BigNumberStringsTypeMap`
- `dateStrings`: `DateStringsTypeMap`

**Prepared:** `sql.prepare` uses the binary protocol, where `FLOAT` widens (`1.1` reads `1.100000023841858`).
