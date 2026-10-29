# Declaring tables

TypeSQL checks every query against a schema: a TypeScript interface that lists your tables and columns. This page shows how to write one by hand. You can also generate it [from a live database](./introspect), derive it [from your migrations](./migrations), or take it [from Kysely, Drizzle or Prisma](./orms).

## A first schema

Each key of the interface is a table, and each column is declared with a helper:

```ts
export interface DB {
	users: {
		id: Generated<"int4">;
		email: Col<"text">;
		display_name: Nullable<"text">;
		mood: Enum<"mood", { hasDefault: true }>;
		created_at: Generated<"timestamptz">;
	};
	posts: {
		id: Generated<"int8">;
		author_id: Col<"int4">;
		title: Col<"text">;
		body: Nullable<"text">;
		tags: Generated<"text[]">;
	};
	user_stats: View<{ user_id: Col<"int4">; posts: Col<"int8"> }>;
	$types: { mood: "happy" | "neutral" | "sad" };
}
```

Then create `sql` from it:

```ts
export const sql = createSql<DB>();
```

## Column helpers

| Helper | Meaning |
|---|---|
| `Col<"text">` | `NOT NULL`, no default |
| `Nullable<"text">` | `NULL` allowed |
| `Generated<"int4">` | has a default (serial, identity, `DEFAULT …`), so it is optional in `INSERT` |
| `NullableGenerated<"text">` | both: `NULL` allowed and has a default |
| `Arr<"int4">` | an array column, `int4[]` (same as `Col<"int4[]">`) |
| `Enum<"mood">` | a column of an enum type, with its values listed under `$types` |
| `Json<T>` | a `jsonb` column holding `T`; see [typed JSON columns](#typed-json-columns) |
| `View<{ … }>` | a view: you can read from it, but `INSERT`, `UPDATE` and `DELETE` on it are errors |

## Type names

Columns use Postgres type names, not TypeScript types. This lets TypeSQL type expressions the way Postgres does: `int4 + int8` is `int8`, and `timestamptz - timestamptz` is an `interval`.

Common spellings mean the same thing: `integer`, `int` and `int4`; `bigint` and `int8`; `boolean` and `bool`; `character varying` and `varchar`; `double precision` and `float8`; `timestamp with time zone` and `timestamptz`. A name TypeSQL doesn't know, such as an extension type or a domain, is kept as it is. It maps to `unknown` unless the type map or `$types` gives it a type.

The driver decides which TypeScript type each Postgres type becomes (node-postgres returns `int8` as a `string`, for example). This is the driver's **type map**, and you pick it by importing `createSql` from the driver's package. See [Type mapping](../reference/type-mapping).

## Typed JSON columns

A `jsonb` column is `unknown` by default. `Json<T>` says what it holds:

```ts
type HistoryItem = { at: string; state: { value: number; note?: string } };

interface DB {
	portfolio: {
		id: Generated<"int4">;
		name: Col<"text">;
		history: Json<HistoryItem[], { hasDefault: true }>;
		settings: Json<{ theme: "dark" | "light" }, { nullable: true }>;
	};
}
const sql = createSql<DB>();
```

`Json<T>` takes the same flags as `Col` as its second argument (`{ nullable: true }`, `{ hasDefault: true }`). Pass `"json"` as the third argument for a `json` column.

Rows read the column as `T`, and `->`, `#>` and subscripts look inside it (see [JSON in queries](./queries#json)):

```ts
const latest = sql(
	`SELECT id, history -> -1 -> 'state' AS state, settings ->> 'theme' AS theme FROM portfolio`,
);
```

Write values with [`sql.json()`](./parameters#json-values), which checks them against `T`:

```ts
const save = sql(
	`UPDATE portfolio SET history = ${sql.json(history)} WHERE id = ${sql.param(1)}`,
);
```

The column is still `jsonb` to Postgres, so JSON operators and functions work as usual. `T` is trusted, not checked against the database.

## Enums

List each enum's values under `$types`. A column declared as `Enum<"mood">` then has the type `"happy" | "neutral" | "sad"`, in rows and in parameters:

```ts
const moods = sql(`SELECT mood, count(*) AS n FROM users GROUP BY mood`);
```

## Functions

Built-in Postgres functions are already known. Declare your own functions, and extension functions TypeSQL doesn't know, under `$functions`:

```ts
interface DB {
  users: { … };
  $functions: { slugify: Sig<["text"], "text"> };
}
```

Calling a function that is neither built in nor declared is an error. See [Expressions and functions](./queries#expressions-and-functions) for the other ways to declare one.

## Other schemas

Tables in a Postgres schema other than `public` go in a nested object:

```ts
interface DB {
  users: { … };
  auth: {
    sessions: { token: Col<"uuid">; user_id: Col<"int4"> };
  };
}
```

## System catalogs

`pg_catalog` and `information_schema` are not part of your schema by default. To query them, add `PgCatalog` to your schema:

```ts
const admin = createSql<DB & PgCatalog>();

const connections = admin(`
  SELECT state, count(*)::int AS total
  FROM pg_stat_activity
  WHERE datname = current_database()
  GROUP BY state`);

const columns = admin(
	`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = $1
  ORDER BY ordinal_position`,
	"users",
);
```

`pg_catalog` relations work with or without the prefix (`FROM pg_stat_activity`), and a table of your own with the same name wins. `information_schema` relations need the prefix (`FROM information_schema.columns`). The catalogs are read-only. Column types are the ones Postgres reports, and a view column is `NOT NULL` only when its definition proves it: `pg_tables.tablename` is `string`, but `pg_tables.schemaname` is `string | null`.

::: details Relations in `PgCatalog` (PostgreSQL 18)
- **Statistics**: `pg_stat_activity`, `pg_stat_database`, `pg_stat_all_tables`, `pg_stat_user_tables`, `pg_stat_all_indexes`, `pg_stat_user_indexes`, `pg_statio_user_tables`, `pg_stat_replication`, `pg_locks`.
- **Catalog views**: `pg_tables`, `pg_views`, `pg_matviews`, `pg_indexes`, `pg_sequences`, `pg_roles`, `pg_settings`, `pg_replication_slots`, `pg_available_extensions`.
- **Catalog tables**: `pg_class`, `pg_namespace`, `pg_attribute`, `pg_type`, `pg_index`, `pg_constraint`, `pg_database`, `pg_proc`, `pg_enum`, `pg_attrdef`, `pg_description`, `pg_depend`, `pg_extension`, `pg_trigger`, `pg_inherits`, `pg_sequence`, `pg_am`.
- **`information_schema`**: `schemata`, `tables`, `columns`, `views`, `table_constraints`, `key_column_usage`, `constraint_column_usage`, `referential_constraints`, `check_constraints`, `routines`, `parameters`, `sequences`, `triggers`, `domains`. Their domains are base types: `sql_identifier` is `name`, `cardinal_number` is `int4`, `character_data` and `yes_or_no` are `varchar`, `time_stamp` is `timestamptz`.
- System types without a driver parser (`xid`, `pg_lsn`, `oidvector`, `int2vector`, `aclitem`, `pg_node_tree`) are `string`.
:::
