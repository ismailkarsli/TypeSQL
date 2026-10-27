# Recipes

Short answers to common tasks. Every example is type-checked against the schema from [Declaring tables](./schema), with `sql` from `createSql<DB>()`.

## Optional filters

Use a named parameter twice: once to check for `NULL`, once to filter. Pass `null` to skip that filter:

<<< @/snippets/recipes.ts#optional-filters

The cast (`::text`, `::int4`) types the `IS NULL` check. Each name is one parameter, sent once.

## A sort order the user picks

Map each allowed choice to a fragment. The statement is checked once for each choice:

<<< @/snippets/recipes.ts#sort

Mapping user choices through an allowlist dictionary or validating sort keys with a strict enum schema guarantees that users cannot choose sensitive columns (such as `password_hash` or internal tokens) or supply invalid column names that would trigger database errors.

To sort by several user-picked keys, use [`sql.combine` over an array](./dynamic-sql#lists-from-runtime-arrays).

## Nested results in one query

Build the nested rows with `json_agg` instead of running a second query. `coalesce(…, '[]')` turns "no rows" into an empty array:

<<< @/snippets/recipes.ts#nested-json

Inside JSON, `int8` is a `number`, because that is how Postgres writes it. See [JSON](./queries#json).

## Partial update from a PATCH body

`sql.set` builds the `SET` list from the keys that are defined:

<<< @/snippets/recipes.ts#patch

`sql.set` throws when no key is defined. Check for an empty body first. See [Partial updates](./writing-data#partial-updates-sql-set).

::: warning Mass assignment
At runtime, `sql.set` writes every key present on the input object. When taking updates from an untrusted request body (such as `req.body`), validate the input using a schema validation library with strict parsing enabled (e.g. Zod's `.strict()` or Valibot's `v.strictObject()`) to actively reject unexpected properties like `is_admin`, or pick allowed fields explicitly.
:::

## Bulk insert

`sql.values` builds the column list and the rows from an array of objects:

<<< @/snippets/recipes.ts#bulk

For very large batches, send one array per column and `unnest` them. The statement text then stays the same size, whatever the number of rows, and array elements accept `null`:

<<< @/snippets/recipes.ts#unnest
