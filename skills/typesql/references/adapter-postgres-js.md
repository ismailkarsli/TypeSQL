# postgres.js

`pnpm add @typesql/core @typesql/postgres postgres` (3.x or 4.x)

```ts
import postgres from "postgres";
import { createSql } from "@typesql/postgres";
import type { DB } from "./db/schema.js";

const db = postgres(process.env["DATABASE_URL"]!);
const sql = createSql<DB>(db);
```

Takes `Sql`, `TransactionSql` or `ReservedSql`. Use TypeSQL's `sql("…")`, not postgres.js' tag. Leave `transform: postgres.camel` off; use `CasePlugin`.

**Rows:**
- `number`: `int2`, `int4`, floats.
- `Date`: dates.
- Other: `bytea` is `Buffer`, `json` is `unknown` or `T`, arrays are element-wise.
- `string`: everything else, including `int8` (`count(*)`), `numeric`, `interval`.
- With `types: { bigint: postgres.BigInt }`, pass `createSql<DB>(db, { bigint: true })`.

**Versions:** a `timestamp` is local time on 3 and UTC on 4. Epoch-number date parameters fail on 4.

**Parameters:** `bool` takes only booleans. Date strings must parse with JS `Date`.
