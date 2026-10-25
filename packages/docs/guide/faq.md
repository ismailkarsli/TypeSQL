# FAQ

## Does TypeSQL need a database connection?

Not to check your queries. Types come from your schema type, which the compiler reads. You only connect to a database to run queries, or once to [generate the schema](./introspect) from a live database.

## Does it work with TypeScript 5 or 6?

No. TypeSQL needs TypeScript 7.1 or later, the native compiler. The [TypeScript Playground](./quick-start) runs TypeScript 6, so treat it as a demo only.

## Why is my `int8` or `count(*)` column a `string`?

node-postgres returns `int8` as a string, because a JavaScript number cannot hold every 64-bit value. TypeSQL types rows the way your driver returns them. With postgres.js you can parse `int8` to `bigint` instead. See [Type mapping](../reference/type-mapping#at-a-glance).

## Why are the keys in a hover in alphabetical order?

TypeScript 7 sorts the keys of computed object types when it shows them. The rows your driver returns keep the `SELECT` order.

## Can I write `` sql`…` `` as a tagged template?

No. TypeScript does not pass the text of a tagged template to the type system, so nothing could be inferred from it. Use a template literal with `${sql.param(value)}` instead. See [Parameters](./parameters).

## What if TypeSQL doesn't support my SQL?

Unsupported SQL is a compile error, never a silent `any`. Use `sql.as<Row>(…)` to skip inference and state the row type yourself. See [Errors and troubleshooting](./errors).

## Is it safe from SQL injection?

Yes. Values are always sent as parameters, and SQL text that isn't a compile-time constant is a compile error. The exception is `sql.raw(text)`: never put user input in it. See [Parameters](./parameters).

## Do I need the VS Code extension?

No. Types, hovers and errors come from TypeScript in any editor. The editor support ([VS Code](./vscode), [Zed](./zed), [Neovim](./neovim)) adds completions and syntax highlighting inside your SQL strings.

## Does it slow down my editor or `tsc`?

A typical query costs a few milliseconds of check time. With hundreds of queries in a project, the optional type cache keeps results between runs. See [Performance and type cache](./performance).

## Does it support MySQL or SQLite?

Not yet. TypeSQL supports only PostgreSQL today. MySQL and SQLite support is planned.

## Can I use it with my ORM?

Yes. `@typesql/kysely`, `@typesql/drizzle` and `@typesql/prisma` take the schema from Kysely, Drizzle or Prisma and run queries on the same connection. See [From Kysely, Drizzle or Prisma](./orms).

## Can I get camelCase row keys?

Yes. Pass `{ rowKeys: "camelCase" }` to `createSql`. See [camelCase row keys](./queries#camelcase-row-keys).
