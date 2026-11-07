# PlanetScale and TiDB Cloud

`pnpm add @typesql/core @typesql/mysql @planetscale/database` (or `@tidbcloud/serverless`)

```ts
import { Client } from "@planetscale/database";
import { createSql } from "@typesql/mysql/planetscale";
import type { DB } from "./db/schema.js";

const sql = createSql<DB>(new Client({ url: process.env["DATABASE_URL"] }));
```

TiDB: `connect({ url })` from `@tidbcloud/serverless`, and `createSql` from `@typesql/mysql/tidb`. Both use the `mysql` dialect. With TCP available, mysql2 also connects.

**Rows:** `bigint` (`count(*)`), `decimal` and dates are all `string`.

**Values** are written into the statement as escaped literals (`Date`s in UTC), so alias expressions that contain parameters. No server-side prepare.
