# Custom executors

An executor is `(text, values)` resolving to rows or `{ rows, rowCount }`. Pass it to core's `createSql` with a dialect from its module.

```ts
import { createSql, type Executor } from "@typesql/core";
import { postgres } from "@typesql/core/postgres";

const run: Executor = async (text, values) => {
	const result = await pool.query(text, [...values]);
	return { rows: result.rows, rowCount: result.rowCount };
};
const sql = createSql<DB>(postgres, run);
```

- Rows alone: `executeCount()` rejects, unless the executor has a `count(text, values)` method.
- Text arrives with `$n`. For `?` drivers, use `positional(text, values)` (SQLite) or `mysqlPositional` (MySQL) from `@typesql/core/adapter`.
- No client: `createSql<DB>(postgres)` builds `{ text, values }`; `mapRows(q, rows)` types the rows you fetch and applies plugins.
- When wrapping an adapter's `executor(client)`, pass its type map: `createSql<DB, PgTypeMap>(postgres, logged)`.
- Don't reshape rows in an executor, since the types describe driver output. Use `CasePlugin`, a custom type map, or a helper over `RowType<Q>`.
