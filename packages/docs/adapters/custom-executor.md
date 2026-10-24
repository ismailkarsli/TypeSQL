# Custom executor

An executor is the function a query runs on. The adapters build one from your driver client, so most apps never need this page. It covers building queries without a client, running on another client, writing an executor, and changing the rows it returns.

## Build queries without a client

`createSql<DB>()` from `@typesql/core` takes no client. Its queries are plain data, `{ text, values }` with the types attached, so you can run them however you like:

<<< @/snippets/custom-executor.ts#without-client

`mapRows(q, rows)` types the driver's rows as the query's rows and applies its [`rowKeys`](../guide/queries#camelcase-row-keys) option. The `execute*` methods of such a query reject unless you pass them an executor, and so does `sql.transaction`.

## Run on another client

Every `execute*` method takes an executor, which wins over the bound one. Each adapter exports `executor(client)` to build one from any client its `createSql` accepts. You can also bind a new `sql` to that client:

<<< @/snippets/adapters.ts#execute-per-call

## Write an executor

An executor is a function `(text, values)` that resolves to the rows, or to `{ rows, rowCount }`:

<<< @/snippets/custom-executor.ts#write

- Return `{ rows, rowCount }` when the driver reports a row count. `executeCount()` returns it. `rowCount: null` means the statement has no count (DDL, `BEGIN`), and `executeCount()` returns 0.
- Return the rows alone when you have no count. Everything except `executeCount()` works; `executeCount()` rejects.
- Or give the executor a `count(text, values)` method that resolves to a number. `executeCount()` then calls it instead. `@typesql/prisma` does this with `$executeRawUnsafe`.

A wrapper around an adapter's executor can return its result unchanged, so the count keeps working. For example, to log how long each query takes:

<<< @/snippets/adapters.ts#custom-executor

## Change the rows

The row types describe what the driver returns, and `execute*` returns the executor's rows as they are (apart from `rowKeys`). So an executor that reshapes rows, for example one that keeps Kysely plugins or post-processes values, makes the types wrong.

Pick the narrowest fix:

1. **camelCase keys.** Use `rowKeys: "camelCase"` and keep the executor plain. With Kysely, use `@typesql/kysely`'s `createSql(db, { rowKeys: "camelCase" })` or `executor(db)`, which bypass plugins, instead of an executor that runs `CamelCasePlugin`.
2. **Different value types** from your driver's parsers (say, `timestamptz` parsed to a string). Use a [type map](../reference/type-mapping#custom-type-maps) that says so: `createSql<DB, MyTypeMap>(executor)`.
3. **Anything else.** Keep the executor plain and transform the rows in a typed helper built on `RowType<Q>`:

<<< @/snippets/adapters.ts#transform-helper

::: warning Augmenting `Query`
You can also augment `Query` to change what `execute*` returns for every query in the program:

```ts
declare module "@typesql/core" {
  interface Query<Row, Params extends readonly unknown[] = readonly unknown[], Text extends string = string> {
    execute(executor?: Executor): Promise<Wire<Row>[]>;
    executeTakeFirst(executor?: Executor): Promise<Wire<Row> | undefined>;
    executeTakeFirstOrThrow(executor?: Executor): Promise<Wire<Row>>;
  }
}
```

This is global and easy to get wrong. The type parameters must repeat core's exactly (names, constraints and defaults). The new signatures win only because TypeScript puts overloads from a later declaration first. `RowType<Q>` still describes the untransformed row. Prefer the fixes above. If you do augment, make sure the executor's transform and the declared type match.
:::

The full `Executor` type is in the [API reference](../reference/api#running-queries).
