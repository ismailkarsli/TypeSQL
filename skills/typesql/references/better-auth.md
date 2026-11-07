# Better Auth

`pnpm add @typesql/core @typesql/better-auth better-auth`. PostgreSQL and SQLite only.

```ts
import { typesqlAdapter } from "@typesql/better-auth";
import { betterAuth } from "better-auth";

export const auth = betterAuth({
	database: typesqlAdapter(sql, { transaction: true }),
	emailAndPassword: { enabled: true },
});
```

Options: `transaction`, `usePlural`, `debugLogs`. For joins: `advanced: { database: { joins: true } }`.

- `sql` must have no plugin, or it's a compile error. Call `sql.withPlugin()` only for your own queries.
- Create the tables yourself, from [Better Auth's core schema](https://www.better-auth.com/docs/concepts/database#core-schema); its CLI can't generate for this adapter. DDL example: <https://typesql.karsli.net/guide/better-auth>.
- Columns are field names, so quote them: `"emailVerified"`, `"user"`.
- `rateLimit: { storage: "database" }` needs a `rateLimit` table.
- SQLite: store booleans as `integer` and dates as `date`. Your raw SQL sees the stored values, so `emailVerified` is a `number`. Leave `transaction` off when requests can overlap, or they reject.
