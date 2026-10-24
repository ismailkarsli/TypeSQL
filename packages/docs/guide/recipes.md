# Recipes

Short answers to common tasks. Every example is type-checked against the schema from [Declaring tables](./schema), with `sql` from `createSql<DB>()`.

## Pagination with LIMIT and OFFSET

Pass the page size and offset as parameters:

<<< @/snippets/recipes.ts#offset

## Keyset pagination

For large tables, continue after the last row you saw instead of counting rows to skip:

<<< @/snippets/recipes.ts#keyset

`posts.id` is `int8`, so the parameter also takes a `string` or `bigint`. See [What a parameter accepts](./parameters#what-a-parameter-accepts).

## Optional filters

Use a named parameter twice: once to check for `NULL`, once to filter. Pass `null` to skip that filter:

<<< @/snippets/recipes.ts#optional-filters

The cast (`::text`, `::int4`) types the `IS NULL` check. Each name is one parameter, sent once.

## Search with LIKE

Build the pattern in SQL, so the parameter stays a plain string:

<<< @/snippets/recipes.ts#search

## Match a list of values

`= ANY($1)` takes an array:

<<< @/snippets/recipes.ts#any

## A sort order the user picks

Map each allowed choice to a fragment. The statement is checked once for each choice:

<<< @/snippets/recipes.ts#sort

To sort by several user-picked keys, use [`sql.list`](./dynamic-sql#lists-from-runtime-arrays).

## Nested results in one query

Build the nested rows with `json_agg` instead of running a second query. `coalesce(…, '[]')` turns "no rows" into an empty array:

<<< @/snippets/recipes.ts#nested-json

Inside JSON, `int8` is a `number`, because that is how Postgres writes it. See [JSON](./queries#json).

## Partial update from a PATCH body

`sql.set` builds the `SET` list from the keys that are defined:

<<< @/snippets/recipes.ts#patch

`sql.set` throws when no key is defined. Check for an empty body first. See [Partial updates](./writing-data#partial-updates-sql-set).

## Bulk insert

`sql.values` builds the column list and the rows from an array of objects:

<<< @/snippets/recipes.ts#bulk

For very large batches, send one array per column and `unnest` them. The statement text then stays the same size, whatever the number of rows:

<<< @/snippets/recipes.ts#unnest

## Insert or update

`ON CONFLICT … DO UPDATE` inserts a row or updates the existing one. `EXCLUDED` is the row you tried to insert:

<<< @/snippets/recipes.ts#upsert

## Count rows or check that one exists

`count(*)` is `int8`, which node-postgres returns as a string. Cast it when you want a number. `EXISTS` is always a boolean:

<<< @/snippets/recipes.ts#count
