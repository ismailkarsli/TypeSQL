# Using `sql`

TypeSQL centers on the `sql` function returned by `createSql<DB>()` (from `@typesql/core` or your driver adapter package). It compiles and type-checks your SQL statements against your schema at compile time, and provides helper functions on `sql.*` for parameter binding, dynamic SQL, fragments, bulk writes, and transactions.

## Overview

| Method | Summary | Expected parameters |
|---|---|---|
| [`sql(query, ...params)`](#sql-query-params) | Parses and type-checks a SQL statement literal, inferring row and parameter types. | `query: string` (literal), `slots?`, `...params: T[]` or `{ [name]: T }` |
| [`sql.as<Row>(query, ...params)`](#sql-as-row-query-params) | Escape hatch: bypasses compile-time inference and asserts the row type directly. | `<Row>`, `query: string`, `slots?`, `...params: unknown[]` |
| [`sql.param(value)`](#sql-param-value) | Binds a value inline inside a template string as a positional `$n` parameter. | `value: T` (`undefined` becomes `DEFAULT`) |
| [`sql.json(value)`](#sql-json-value) | Binds a value as inline JSON text, checked against `json`/`jsonb`/`Json<T>` columns. | `value: T` (`null` / `undefined` becomes SQL `NULL`) |
| [`sql.fragment(text, ...params)`](#sql-fragment-text-params) | Creates a reusable SQL fragment to splice into query `{slot}` placeholders. | `text: string` (literal), `slots?`, `...params` |
| [`sql.id(...parts)`](#sql-id-parts) | Creates a safely quoted identifier fragment (`"col"` or `"schema"."table"`). | `...parts: string[]` (column, table, schema names) |
| [`sql.join(items, separator?)`](#sql-join-items-separator) | Joins an array or tuple of fragments or queries with a separator string. | `items: Slottable[]`, `separator?: string` (default `", "`) |
| [`sql.set(table, values)`](#sql-set-table-values) | Generates a type-checked `SET "col" = $n` fragment for `UPDATE`, omitting `undefined`. | `table: TableName<DB>`, `values: SetInput<DB, TM, table>` |
| [`sql.values(table, rows)`](#sql-values-table-rows) | Generates a type-checked `("col") VALUES (...)` fragment for `INSERT`. | `table: TableName<DB>`, `rows: InsertInput<DB, TM, table>[]` |
| [`sql.raw(text)`](#sql-raw-text) | Creates an untyped, raw SQL text fragment (requires `sql.as<Row>()`). | `text: string` |
| [`sql.transaction(fn)`](#sql-transaction-fn) | Runs an async callback in a database transaction with commit, rollback, and savepoints. | `fn: (tx: TransactionalSql) => Promise<T>` |

---

## `sql(query, ...params)`

```ts
sql<Q>(query: Q, ...params: Params): Query<Row, Params, Text>
sql<Q, S>(query: Q, slots: S, ...params: Params): Query<Row, Params, Text>
```

The core function for writing typed queries. TypeSQL's type engine parses the SQL string literal at compile time, checks syntax and relation/column references against `DB`, and infers:
- **`Row`**: The resulting row shape (column names, types, and nullability).
- **`Params`**: The expected parameter types (or named parameter object).
- **`Text`**: The normalized SQL text sent to Postgres.

Invalid statements cause compile errors directly on the SQL string.

### Parameters

- `query` (`string`): A compile-time string literal containing the SQL statement. Can include:
  - Positional placeholders: `$1`, `$2`, …
  - Named placeholders: `:name`
  - Inline expressions: `${sql.param(val)}`, `${sql.json(val)}`
  - Fragment slots: `{slotName}`
  *(Tagged templates like `` sql`…` `` are not supported because TypeScript erases their string literal types).*
- `slots` (`Record<string, Fragment | Query>`, *optional*): An object mapping slot names to fragments (`sql.fragment`, `sql.id`, `sql.join`, etc.) or subqueries (`Query`). Required when `{slotName}` tokens appear in `query`.
- `...params` (*optional*):
  - When using `$n`: Positional argument values matching the inferred types in `$1`, `$2`, … order.
  - When using `:name`: Exactly one object whose keys match the named placeholders `{ [name]: value }`.

### Examples

<<< @/snippets/using-sql.ts#sql-query

<<< @/snippets/using-sql.ts#sql-named

<<< @/snippets/using-sql.ts#sql-slots

See [Selecting data](./queries) and [Parameters](./parameters).

---

## `sql.as<Row>(query, ...params)`

```ts
sql.as<Row>(query: string, ...params: unknown[]): Query<Row, readonly unknown[]>
sql.as<Row>(query: string, slots: SlotMap, ...params: unknown[]): Query<Row, readonly unknown[]>
```

An escape hatch that skips TypeSQL's compile-time type inference and explicitly asserts the row type `Row`. Use it for dynamic SQL where the statement text is not known at compile time, unsupported PostgreSQL features, or statements containing `sql.raw()`.

### Parameters

- `<Row>` (*type parameter*): The expected TypeScript type of the returned rows. When using `{ rowKeys: "camelCase" }`, write `Row` with camelCase property names.
- `query` (`string`): The SQL query string. Does not need to be a compile-time string literal.
- `slots` (`Record<string, Fragment | Query>`, *optional*): An object mapping `{slotName}` tokens to fragments or subqueries.
- `...params` (*optional*): Values passed as positional parameters or as a single named parameter object.

### Example

<<< @/snippets/using-sql.ts#sql-as

See [Errors and troubleshooting](./errors#sql-as-row).

---

## `sql.param(value)`

```ts
sql.param<T>(value: T): InlineMarker<T>
```

Binds an expression as an inline parameter inside an interpolated template string (e.g. `` sql(`… WHERE id = ${sql.param(userId)}`) ``).

At runtime, the value is rewritten to a positional `$n` parameter—it is never concatenated as raw text, preventing SQL injection. At compile time, TypeScript checks the value's type against the expected column type.

### Parameters

- `value` (`T`): The value to bind to the parameter. If `value` is `undefined`, it is sent as SQL `DEFAULT`. When a value can be `undefined`, the statement must allow `DEFAULT` in that position (such as in an `INSERT … VALUES` or `UPDATE … SET` clause).

### Example

<<< @/snippets/using-sql.ts#sql-param

See [Inline parameters](./parameters#inline-sql-param-value).

---

## `sql.json(value)`

```ts
sql.json<T>(value: T): JsonMarker<T>
```

Binds an inline JSON or JSONB value inside an interpolated template string.

At runtime, the value is serialized to JSON text and sent with driver-safe formatting (preventing node-postgres from mistaking JavaScript arrays for PostgreSQL arrays). At compile time, the value is checked against `json`/`jsonb` columns or custom `Json<T>` schema types.

### Parameters

- `value` (`T`): The object, array, or primitive to serialize as JSON. Passing `null` or `undefined` sends SQL `NULL`.

### Example

<<< @/snippets/using-sql.ts#sql-json

See [JSON values](./parameters#json-values).

---

## `sql.fragment(text, ...params)`

```ts
sql.fragment<Text>(text: Text, ...params: Params): Fragment<Text, Params>
sql.fragment<Text, S>(text: Text, slots: S, ...params: Params): Fragment<Text, Params>
```

Creates a reusable, spliceable piece of SQL to insert into `{slotName}` placeholders in queries or other fragments.

Fragments preserve their parameter types and carried values. When spliced into a parent query, their parameters are automatically renumbered after the parent statement's parameters and type-checked against the outer query context.

### Parameters

- `text` (`string`): A compile-time string literal containing SQL. May include `$n`, `:name`, inline `${sql.param()}` calls, or nested `{slotName}` placeholders.
- `slots` (`Record<string, Fragment | Query>`, *optional*): An object mapping nested slot names to other fragments or subqueries.
- `...params` (*optional*): Positional argument values or one named parameter object matching parameters defined inside `text`.

### Example

<<< @/snippets/using-sql.ts#sql-fragment

See [Dynamic SQL](./dynamic-sql).

---

## `sql.id(...parts)`

```ts
sql.id(...parts: [string, ...string[]]): Fragment
```

Creates a safely quoted PostgreSQL identifier fragment. Each argument is quoted in double quotes and joined by periods (`"part1"."part2"`).

Use `sql.id` to safely parameterize table names, column names, or schema-qualified relations without risking SQL injection.

### Parameters

- `...parts` (`string[]`): One or more identifier segments.
  - `sql.id("name")` produces `"name"`.
  - `sql.id("schema", "table")` produces `"schema"."table"`.
  - Also accepts unions of literal strings (checked for each union member) or generic relation names (`RelationName<DB>`).

### Example

<<< @/snippets/using-sql.ts#sql-id

See [Identifiers and lists](./dynamic-sql#identifiers-and-lists).

---

## `sql.join(items, separator?)`

```ts
sql.join(items: readonly Slottable[], separator: string = ", "): Fragment
```

Joins an array or tuple of fragments or subqueries with a delimiter into a single fragment.

- When given a tuple (`[a, b]`), literal SQL text is preserved.
- When given a dynamic runtime array (`Slottable[]`), TypeSQL validates a representative statement where each distinct element type is checked once. This keeps dynamic clauses (like dynamic `ORDER BY`, `AND` filters, or `IN (...)` lists) fully type-safe.

### Parameters

- `items` (`readonly Slottable[]`): A non-empty array or tuple of fragments (`Fragment`) or subqueries (`Query`). Throws at runtime if empty.
- `separator` (`string`, *optional*): The delimiter string placed between elements. Defaults to `", "`.

### Example

<<< @/snippets/using-sql.ts#sql-join

See [Lists from runtime arrays](./dynamic-sql#lists-from-runtime-arrays).

---

## `sql.set(table, values)`

```ts
sql.set<T>(table: T, values: SetInput<DB, TM, T>): Fragment
```

Generates a type-checked `SET "col1" = $1, "col2" = $2` fragment for `UPDATE` statements from a JavaScript object.

Keys must match column names of `table`, and values must match their corresponding column types. Properties with `undefined` values are automatically omitted, allowing partial updates without manually constructing dynamic SQL.

### Parameters

- `table` (`TableName<DB>`): The table name as a string literal (e.g. `"users"` or `"schema.users"`).
- `values` (`SetInput<DB, TM, table>`): An object with column updates. Throws at runtime if no properties are defined.

### Example

<<< @/snippets/using-sql.ts#sql-set

See [Updating with sql.set](./writing-data#updating-with-sql-set).

---

## `sql.values(table, rows)`

```ts
sql.values<T>(table: T, rows: readonly InsertInput<DB, TM, T>[]): Fragment
```

Generates a type-checked column list and multi-row `("col1", "col2") VALUES ($1, $2), ($3, DEFAULT)` fragment for bulk `INSERT` statements from an array of objects.

NOT NULL columns without defaults are required on every row. Optional or defaultable columns that are missing or set to `undefined` emit `DEFAULT`.

### Parameters

- `table` (`TableName<DB>`): The table name as a string literal (e.g. `"users"`).
- `rows` (`readonly InsertInput<DB, TM, table>[]`): A non-empty array of row objects. Throws at runtime if the array is empty.

### Example

<<< @/snippets/using-sql.ts#sql-values

See [Bulk insert with sql.values](./writing-data#bulk-insert-with-sql-values).

---

## `sql.raw(text)`

```ts
sql.raw(text: string): Fragment<string, [], []>
```

Creates an untyped, unsanitized SQL text fragment.

Because raw fragments bypass compile-time syntax and schema analysis, queries containing them cannot be inferred and must use [`sql.as<Row>()`](#sql-as-row-query-params).

::: danger Caution: SQL Injection
Never pass untrusted user input to `sql.raw()`. Use `$n`, `:name`, `${sql.param()}`, or `sql.id()` instead.
:::

### Parameters

- `text` (`string`): Raw SQL string sent directly to the database.

### Example

<<< @/snippets/using-sql.ts#sql-raw

See [Fully dynamic SQL](./dynamic-sql#fully-dynamic-sql).

---

## `sql.transaction(fn)`

```ts
sql.transaction<T>(fn: (tx: TransactionalSql) => Promise<T>): Promise<T>
```

Runs an async callback inside a database transaction. Available on `sql` instances created with an adapter package (`@typesql/pg`, `@typesql/postgres`, `@typesql/kysely`, `@typesql/drizzle`, `@typesql/prisma`).

- Automatically commits when `fn` resolves, and rolls back if `fn` throws.
- The callback receives `tx`, a transactional `sql` instance bound to the active transaction.
- Nested calls `tx.transaction(fn)` automatically manage savepoints.

### Parameters

- `fn` (`(tx: TransactionalSql) => Promise<T>`): An async callback receiving the transactional `tx` handle.

### Example

<<< @/snippets/using-sql.ts#sql-transaction

See [Transactions](./transactions).

---

## Running queries: `Query` methods

Calling `sql(...)` or `sql.as(...)` returns a `Query<Row, Params, Text>` object:

<<< @/snippets/using-sql.ts#query-methods

### Properties

| Property | Type | Description |
|---|---|---|
| `q.text` | `string` | The finalized SQL statement with positional `$1, $2, …` parameters and spliced fragments. |
| `q.values` | `unknown[]` | The array of parameter values sent to Postgres in `$n` order. |

### Execution methods

When `createSql` is initialized with a client or executor (or when one is passed to the execution method), `q` provides:

| Method | Returns | Description |
|---|---|---|
| `q.execute(executor?)` | `Promise<Row[]>` | Executes the query and returns all matching rows. |
| `q.executeTakeFirst(executor?)` | `Promise<Row \| undefined>` | Returns the first matching row, or `undefined` if none matched. |
| `q.executeTakeFirstOrThrow(executor?)` | `Promise<Row>` | Returns the first row, or rejects with `NoResultError` if no rows matched. |
| `q.executeCount(executor?)` | `Promise<number>` | Returns the count of affected rows (`INSERT`, `UPDATE`, `DELETE`, `MERGE`) or returned rows (`SELECT`). |
