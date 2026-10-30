# Inserting and updating

`INSERT`, `UPDATE`, `DELETE` and `MERGE` are checked against your schema like queries, and parameters take the types of the columns they are assigned to. This page covers what is checked, plus helpers for optional values, partial updates and bulk inserts.

```ts
const created = sql(
	"INSERT INTO users (email, display_name, mood) VALUES ($1, $2, $3) RETURNING id, created_at",
	"a@b.c",
	null,
	"happy",
);
```

With `RETURNING`, a statement has a row type. Without it, the row type is `never`: `execute()` resolves to `[]`, and `executeCount()` returns the number of affected rows. `executeTakeFirstOrThrow()` on such a statement always throws `NoResultError`:

```ts
const renamed = sql(
	"UPDATE users SET display_name = $1 WHERE id = $2",
	"Ada",
	7,
);
const touched = sql(`
  UPDATE posts p SET title = upper(p.title)
  FROM users u
  WHERE u.id = p.author_id AND u.mood = 'sad'
  RETURNING p.id, u.email`);
```

## What is checked

- Target columns must exist, and values must fit their types, `null` only for nullable columns.
- Every `NOT NULL` column without a default must be set:

  ```ts
  sql("INSERT INTO users (display_name) VALUES ($1)", "Ada");
  ```

- `DEFAULT` is only allowed as a whole `VALUES` item or `SET` value, and not for a `NOT NULL` column without a default.
- Assigning to an array element, a `jsonb` key or a composite field (`SET tags[1] = $1`) takes that element's or field's type.
- Writing to a view is an error: `cannot insert into view "v"`.
- `RETURNING *` expands as in Postgres: to the target table, or to every table in `FROM` / `USING`.
- `RETURNING old.*` and `new.*` (PostgreSQL 18): `old` columns are nullable in an `INSERT`, `new` columns in a `DELETE`.
- In `MERGE`, each `WHEN` clause sees only the tables Postgres lets it see, and its actions are checked like an `UPDATE` or `INSERT`. Source columns in `RETURNING` are nullable when a `NOT MATCHED BY SOURCE` action returns rows.

## Optional values

`sql.param(sql.empty)` sends `DEFAULT` instead of a parameter. Use `sql.param(value ?? sql.empty)` or `sql.param(sql.empty(value))` to explicitly request a default for a nullish value. `sql.param(undefined)` is rejected. The column's default stays in the database, so you don't copy it into a `coalesce(…)`:

```ts
declare const mood: "happy" | "neutral" | "sad" | undefined;
const signup = sql(`
  INSERT INTO users (email, mood)
  VALUES (${sql.param("a@b.c")}, ${sql.param(mood ?? sql.empty)})
  RETURNING id, mood`);
signup.text;
```

The value is checked like any parameter, without the `sql.empty` sentinel. When it can be `sql.empty`, the statement is checked a second time with `DEFAULT` in its place. So such a value for a `NOT NULL` column without a default is an error, and so is one outside a `VALUES` item or `SET` value:

```ts
sql(`INSERT INTO users (email) VALUES (${sql.param(maybeEmail ?? sql.empty)})`);
sql(`SELECT id FROM users WHERE email = ${sql.param(maybeEmail ?? sql.empty)}`);
```

Narrow the value first, or pass `maybeEmail ?? null` to send `NULL`. To preserve explicit `null` while using a default only for `undefined`, pass `maybeEmail === undefined ? sql.empty : maybeEmail`. `sql.fragment(…)` refuses a value that can be `sql.empty`: a fragment is checked where it is spliced, with `$n` for its values, so a `DEFAULT` there couldn't be checked. `any` and `unknown` values are not checked.

## Partial updates: `sql.set`

`sql.set(table, values)` builds a `SET` list from an object, such as a PATCH request body with optional keys. `undefined` values are skipped:

```ts
declare const patch: {
	display_name?: string | null;
	mood?: "happy" | "neutral" | "sad";
};
const set = sql.set("users", patch);
const patched = sql(
	"UPDATE users SET {set} WHERE id = $1 RETURNING id, display_name, mood",
	{ set },
	7,
);
patched.text;
```

- Keys must be columns of the table, and values must fit them: `null` only for nullable columns, enum values for enums.
- Keys that are not columns are errors, even on a variable whose type has extra keys, because they would be sent.
- Splice it into `UPDATE … SET {set}` or `ON CONFLICT … DO UPDATE SET {set}`. Other assignments can follow: `SET {set}, updated_at = now()`, for columns that are not keys of the input type (Postgres rejects a second assignment: `multiple assignments to same column "updated_at"`).

::: warning Empty input
If no value is defined at runtime, `sql.set` throws, because SQL needs at least one assignment. Skip the `UPDATE` (or `SELECT` the row) when the input is empty.
:::

::: warning Mass assignment protection
The `table` argument is used only at compile time by TypeScript to verify known columns and value types. TypeSQL carries no schema metadata at runtime; `sql.set` iterates over all enumerable properties of `values` and converts each key into a column assignment.

If `values` comes from an untrusted source (such as `req.body`) and is typed as `any` or retains excess properties, every property on the object—including sensitive fields like `is_admin`, `role`, or `password_hash`—will be written to the database.

When accepting user input, validate payloads using a schema validation library with strict parsing enabled (such as Zod's `.strict()` or Valibot's `v.strictObject()`) to actively reject unexpected properties at the request boundary, or explicitly pick permitted fields via destructuring.
:::

## Bulk inserts: `sql.values`

`sql.values(table, rows)` builds the column list and the `VALUES` rows from an array of objects:

```ts
declare const imported: { email: string; display_name?: string | null }[];
const rows = sql.values("users", imported);
const inserted = sql(
	"INSERT INTO users {rows} ON CONFLICT (email) DO NOTHING RETURNING id",
	{ rows },
);
inserted.text;
```

- `NOT NULL` columns without a default are required in every row. The others are optional.
- The columns are the keys that have a value in any row, in order of first use. A missing or `undefined` value is sent as `DEFAULT`, so rows with different keys can be mixed.
- A single row with no values becomes `DEFAULT VALUES`. An empty array throws, and so do several rows with no values.

The table name is only used for typing. Write tables in other schemas as `"schema.table"`: `sql.values("auth.sessions", rows)`.

::: warning Mass assignment in bulk inserts
Like `sql.set`, `sql.values` checks column types at compile time, but at runtime it reflects every key present across all row objects into the `INSERT` column list. If row objects contain unvalidated user input, unexpected columns will be inserted. Validate input rows using a strict schema parser or explicitly pick allowed properties before passing objects to `sql.values`.
:::

### JSON columns

`sql.set` and `sql.values` send their values as parameters, so JSON values go through `sql.json(value)` there too. It is sent as JSON text by both drivers and checked against a [`Json<T>`](./schema#typed-json-columns) column:

```ts
const patch = sql.set("portfolio", {
	history: sql.json(history),
	settings: { theme: "dark" },
});
const patched = sql("UPDATE portfolio SET {patch} WHERE id = $1", { patch }, 1);

const rows = sql.values("portfolio", [
	{ name: "a", history: sql.json(history) },
	{ name: "b" },
]);
const created = sql("INSERT INTO portfolio {rows} RETURNING id", { rows });
```

On PostgreSQL a plain object also works as it is. SQLite drivers can't bind objects, so use `sql.json()` there. An array without `sql.json()` is an error, because node-postgres would send it as a Postgres array.

For identity columns and other limits of these helpers, see [Limits](./limits).
