# @typesql/prisma

Write [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries against your [Prisma](https://www.prisma.io) schema, and run them through Prisma Client.

## Install

```sh
npm install @typesql/core @typesql/prisma
```

Requires `@prisma/client` 7 or later, with the `postgresql` provider.

## Usage

Add the generator to `schema.prisma`:

```prisma
generator typesql {
  provider = "typesql-prisma"
  output   = "../src/db/typesql.ts"
}
```

Every `prisma generate` then writes a `DB` type with the database's own table and column names, native types, defaults and enums. Pass it to `createSql` with your Prisma Client:

```ts
import { createSql } from "@typesql/prisma";
import { postgres } from "@typesql/core/postgres";
import type { DB } from "./db/typesql";

const sql = createSql<DB>(postgres, prisma);

const users = await sql("SELECT id, display_name FROM users WHERE email = $1", email).execute();

await sql.transaction(async (tx) => {
  await tx("DELETE FROM posts WHERE author_id = $1", 1).execute();
});
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBAbwFAEgYE8wFM4GEIA2ANKhtnAOJYB2WUAhjFgCYlqY4ByArgQfQCMCWNpADOMAOZQsYkgF84AMygQQcAEQABMrICOBAPQBjaFkPipMsRoDcSUJFiI4xmYywBlA0Ti64AApQwGIg9ABK9ADuuATANPCKKmqaOhxiBhbBofR2SA7UTFBK9MY4ACIAQoio3GJ0YgBcNSgowMzNVLQMTMwAPBrAhQAsGgB89q1YYcAEzfgEAwBu9FDGABar45MozCFg-OgA+tT0IFjNPHyCwgNMAB4w26goqsKdNHQe-RrhhFjPVrcMDMb4AQRg80Id1AshgZzAgPkk0sTRabQ6eGhGm43HagJQ9G4MHW0CO7Shi0GIwJMGAMHeWKpDyeExeS3iUTRXS+vQGQxgAA4kZMACS6NHIVp-RkaMHlACyAElOBo4AAfTQAVU8AFFwnkUMikPJ8swsMZ+DJXBBqBI4GBsmFmkEQmFIjE4gl7KY7fAMgQ4ABeVzuJjeRZVMYACks0lkvkdbvoAEp7Ehffb6MwQEMxMG4NF6PS4AHo6gAAZ6gAyutwABU4O1fHsxAd6MdTudfDiQeCnnAAGLhADyCrgdQacAA6gAJfW6uBvHAh0UARgrbDlipVGhIKYAdFh7hbiVho2n8pn-fCYPmQ0WS2XKzW642iSSyc2bdxCtGAFQpnAYKeA6EASHIpbcCA0YclgXJASBcBwVyQ6juOqKUKOWoBHAlQAJqFsSpJQOSzCbkgh7HqeTAXum15wOawi9AWj7+gYB4wAwdqlHStrRtGMD3EBQZjKQ9zRhW5S6rW9aLsOY5gRBM7zuEi4fiRZEFuum5wGuVEnsYZ74L+MAXvu6ZlhWKp6uEjYqvWI5KXecDRhpX6sH49LCEBABqYLVlquqgdG66+KKABMKa6WuPazlgfAQBol5AA) <span data-playground="prisma"></span> to hover the types and edit the SQL, with nothing to install.

Good to know:

- Rows are typed the way Prisma's raw queries return them: `int8` (so `count(*)`) is `bigint`, `numeric` is `Decimal`.
- `uuid()`, `cuid()`, `nanoid()`, `ulid()` and `@updatedAt` are filled in by Prisma Client, not the database, so a SQL `INSERT` must set them.
- Without the generator, `createSql(postgres, prisma)` reads the types Prisma Client already generates. They don't record `@map` names or native types, so you may need overrides.

## Documentation

See [From Kysely, Drizzle or Prisma](https://typesql.karsli.net/guide/orms#prisma) for the generator's options, what it emits and overrides, and [Type mapping](https://typesql.karsli.net/reference/type-mapping#prisma) for the row types.

## License

[MIT](LICENSE)
