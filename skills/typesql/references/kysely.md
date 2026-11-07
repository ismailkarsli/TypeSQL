# Kysely

`pnpm add @typesql/core @typesql/kysely kysely` (0.28+). The schema is read from `Kysely<DB>`'s type. The dialect goes first; `postgres` here, see your database's file.

```ts
import { postgres } from "@typesql/core/postgres";
import { createSql } from "@typesql/kysely";

const sql = createSql(postgres, db);

await db.transaction().execute(async (trx) => {
	await createSql(postgres, trx)("DELETE FROM posts WHERE author_id = $1", 1).execute();
});
```

- Queries bypass Kysely plugins, so use TypeSQL's `CasePlugin`.
- Only `Generated` columns have defaults; override others with `{ hasDefault: true }`.
- JSON columns read as `unknown`, not `T`.
- `GeneratedAlways` writes compile, then fail in the database.
- For exact types, use `typesql introspect` instead.
- Overrides are the third type argument, a type name or `{ type?, nullable?, hasDefault? }`, or `{ $view: true }` on a table. They aren't validated, so probe the row type.
- `kysely-codegen --camel-case`: pass `{ camelCase: true }` as the fourth type argument; SQL still uses snake_case.
- Migrator on a pool: run inside `db.connection().execute((c) => …)` with `executor(c)`.
