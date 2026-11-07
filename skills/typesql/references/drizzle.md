# Drizzle

`pnpm add @typesql/core @typesql/drizzle drizzle-orm` (0.45+, before 1.0). The schema is read from `db`'s type, so pass `drizzle(…, { schema })`, or every query fails with `relation does not exist`. The dialect goes first; see your database's file.

- SQL and rows use database names (`display_name`), not TypeScript keys. For camelCase rows, add `.withPlugin(new CasePlugin())`.
- `.$defaultFn()` and `.$default()` aren't database defaults, so raw `INSERT`s must set them.
- `$onUpdate` columns wrongly look optional in `INSERT`.
- Rows are driver output; Drizzle's `mode` and mappers don't apply.
- Export enums; an unexported one's column is plain text.
- `casing` isn't in Drizzle's types: `createSql<typeof schema, TypeMap, { casing: "snake_case" }>(dialect, db)`.
- For exact types, use `typesql introspect` instead.
