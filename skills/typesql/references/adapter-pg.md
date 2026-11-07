# node-postgres

`pnpm add @typesql/core @typesql/pg pg`

```ts
import { Pool } from "pg";
import { createSql } from "@typesql/pg";
import type { DB } from "./db/schema.js";

const sql = createSql<DB>(new Pool());
```

Takes a `Pool`, `Client` or `PoolClient`. `executor(client)` runs one query elsewhere: `q.execute(executor(client))`.

**Rows:**
- `string`: `int8` (`count(*)`), `numeric`, `money`, `uuid`, `time`, ranges.
- `number`: `int2`, `int4`, floats.
- `Date`: `date`, `timestamp`, `timestamptz`.
- Other: `bytea` is `Buffer`, `interval` is `PgInterval`, `json` is `unknown` or `T`.
- Runtime mismatch: `numeric[]` is `number[]` though typed `string[]`; arrays without a parser (`name[]`, range arrays) arrive as raw `{…}` text.

**Parameters** also take `number | bigint | string` for `int8`/`numeric`, `Date | string` for dates, `Uint8Array` for `bytea`.

**Custom parsers** (`pg.types.setTypeParser`) need a custom map: `createSql<DB, MyMap>(postgres, executor(pool))`, with `createSql` from core and `interface MyMap extends Omit<PgTypeMap, "int8">`.

**Prepared:** after `ALTER TABLE`, a prepared `SELECT *` fails with `cached plan must not change result type`. List the columns.
