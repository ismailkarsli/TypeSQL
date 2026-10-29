# Recipes

Short answers to common tasks. Every example is type-checked against the schema from [Declaring tables](./schema), with `sql` from `createSql<DB>()`.

## Optional filters

Use a named parameter twice: once to check for `NULL`, once to filter. Pass `null` to skip that filter:

```ts
const found = sql(
	`SELECT id, email FROM users
   WHERE (:email::text IS NULL OR email = :email)
     AND (:minId::int4 IS NULL OR id >= :minId)`,
	{ email: filters.email, minId: filters.minId },
);
```

The cast (`::text`, `::int4`) types the `IS NULL` check. Each name is one parameter, sent once.

## A sort order the user picks

Map each allowed choice to a fragment. The statement is checked once for each choice:

```ts
const ORDER = {
	newest: sql.fragment("created_at DESC"),
	oldest: sql.fragment("created_at"),
	email: sql.fragment("email"),
} as const;

const sortedUsers = sql("SELECT id, email FROM users ORDER BY {order}, id", {
	order: ORDER[sort],
});
```

Mapping user choices through an allowlist dictionary or validating sort keys with a strict enum schema guarantees that users cannot choose sensitive columns (such as `password_hash` or internal tokens) or supply invalid column names that would trigger database errors.

To sort by several user-picked keys, use [`sql.combine` over an array](./dynamic-sql#lists-from-runtime-arrays).

## Nested results in one query

Build the nested rows with `json_agg` instead of running a second query. `coalesce(…, '[]')` turns "no rows" into an empty array:

```ts
const authors = sql(`
  SELECT u.id, u.email,
         coalesce(
           (SELECT json_agg(json_build_object('id', p.id, 'title', p.title) ORDER BY p.id)
            FROM posts p WHERE p.author_id = u.id),
           '[]'
         ) AS posts
  FROM users u`);
```

Inside JSON, `int8` is a `number`, because that is how Postgres writes it. See [JSON](./queries#json).

## Partial update from a PATCH body

`sql.set` builds the `SET` list from the keys that are defined:

```ts
type UserPatch = {
	display_name?: string | null;
	mood?: "happy" | "neutral" | "sad";
};

function updateUser(id: number, patch: UserPatch) {
	const set = sql.set("users", patch);
	return sql("UPDATE users SET {set} WHERE id = $1 RETURNING id", { set }, id);
}
```

`sql.set` throws when no key is defined. Check for an empty body first. See [Partial updates](./writing-data#partial-updates-sql-set).

::: warning Mass assignment
At runtime, `sql.set` writes every key present on the input object. When taking updates from an untrusted request body (such as `req.body`), validate the input using a schema validation library with strict parsing enabled (e.g. Zod's `.strict()` or Valibot's `v.strictObject()`) to actively reject unexpected properties like `is_admin`, or pick allowed fields explicitly.
:::

## Bulk insert

`sql.values` builds the column list and the rows from an array of objects:

```ts
const rows = sql.values("posts", newPosts);
const created = sql("INSERT INTO posts {rows} RETURNING id", { rows });
```

For very large batches, send one array per column and `unnest` them. The statement text then stays the same size, whatever the number of rows, and array elements accept `null`:

```ts
const authorIds = newPosts.map((p) => p.author_id);
const titles = newPosts.map((p) => p.title);
const createdMany = sql(
	"INSERT INTO posts (author_id, title) SELECT * FROM unnest($1::int4[], $2::text[]) RETURNING id",
	authorIds,
	titles,
);
```