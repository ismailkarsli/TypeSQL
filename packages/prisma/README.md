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
import type { DB } from "./db/typesql";

const sql = createSql<DB>(prisma);

const users = await sql("SELECT id, display_name FROM users WHERE email = $1", email).execute();
// { id: number; display_name: string | null }[]

await sql.transaction(async (tx) => {
  await tx("DELETE FROM posts WHERE author_id = $1", 1).execute();
});
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBagAoBOGAzgLYCGoAFAAJYywkCOANsNMeRQJQB0EHLFAM4LVgFpOpSqADmsAHaxCFLAHtC6YliYihoACIAhUBkW7CAMwoBjYQCNYrdWgBQIUOsWhYANxVIUAADaW55JRU1WGCAGnRsPFxhABM1CgcKElgAchIvNB9FCjI9OkpoHnjirAwAkUZ8uhSHPgAqHlAKRRSPMBTYGwBXViwSAQAlCjRQJFRkn0IhxXzcQnUhuTxIDa0iGQoAYVYMJSwBAAl1AK1k0EImEbG+Pr7Qd4VlVQ1bxrZQADeb3e7041wwAy0AF5QAAiURMNhSLiUWHAkEbLDQIZYEEw2F8PjAEiEWzAFrABHiPhjNGed4AXzcbgwZGgmlxCMBoEO6lY8QA4pFvrAUvEAHIjVgZVjCBmgKzrMhw+h-di2TSwWEAbhZbI53NsD2i8DY8S5+24UzQx1OFlA8sV6mVsNVYjYHBRFB1zM8JLJFKpbBpJHiWQiX2ivXMlhs9iMpiBAEhgG02gQvaAyOoBqwQgBVbKEYICNrANxJoZFkgALkBFaTELrQsjuhSAB5YTGACywgB8uqTSdglAwrDrvNYnb8FFJOFn-cHKbTGYOCtOrBSIWKpRLoDLDZSpGg0sgAH0d7A65LWNKHLLO7oAB5YRcN9ay5vCqOdiZ8rUDg2qbpsEtBDNAaRtgAglgwR1tkuIOEElqyLaZzVOooCQRkWSpIMFBPKW5ZDuBkGijBE58o+rJMFgJTQG+SYMoOwGruE2a5iE+DqCQsFERW7K8bW9ZDk2PJUbCQxDBCjHLumKFUFYG5bsEBG4JoACSKR7geQ5qTgmhnmJk6dj2sm1Fgn7iVO8KwC+sl+KcaDCS2URtqZFgAByMcxFYACRUnWyZJn+VmwlBhgALIaeKsKgAAPnC+bwAAohMPpMbqTJuAMtjSg8oAaisuJhJQdYKdaaEWNqoCeDsQx7F6VVYG4RW8aA4igDCRqwCabDtiYfbUKVvA1Z4SwrF4Ph+cwQyBNa+YrBQViwGGrBoBQkD5JguCgA45hbtAs4lLAlgkMybW4hQKRkOY+QwtMFDYB1bDUBWwSpcgKWHOAZhilhx6nheJ3xJJEFRjBcUAGITAA8pFoBVio+QAOoXGlKX3P+XWgH5ACMcQVuFUUxbCsRuPwdmwLYOKwNQPC6vS7wAHoAPy+mAf7OV0BUIlu4YzXNhCQNa9ynQ1k3JGQdYxp5Zj5PtcgxtUQylMQtjy0Y1OshQrAvJdHV0WMOOPc94hvUmH0pV9P1dDiBmEEZ-0assWDUB0oBQfAoCCWM8QkKr1CObAzmdF7oDB9zMPwz7PHGwKcP5vgoDGAAmnb6mOxChOU0+1O0-TjNgCCbMXd47W5qdoomxtZvBlgqhLbYtTeNQ1BYE+nRQn2FYd9QwSGNbKXgJj0cI77qPoxMmP6YZEI4-jcSgHjuf57ovKu-T5MM+ioCl28E98PPpCgLQAzDKM1BSRC9M8OVmbNeut75M95jxNxvFyA8+QpOoeiKOoc4bhzbBBiqlCYv0YrgFhrHISNBZ5Z3+hZWUnQABqUFkD5hSt7ag+N4h+QAEw8CXnjUGFxnAuFhAzWqYAVDrEIDLLc858gAKwukTI2QsL4SeG4IAA) <!-- playground:prisma --> to hover the types and edit the SQL, with nothing to install.

Good to know:

- Rows are typed the way Prisma's raw queries return them: `int8` (so `count(*)`) is `bigint`, `numeric` is `Decimal`.
- `uuid()`, `cuid()`, `nanoid()`, `ulid()` and `@updatedAt` are filled in by Prisma Client, not the database, so a SQL `INSERT` must set them.
- Without the generator, `createSql<Prisma.TypeMap>(prisma)` reads the types Prisma Client already generates. They don't record `@map` names or native types, so you may need overrides.

## Documentation

See [From Kysely, Drizzle or Prisma](https://typesql.karsli.net/guide/orms#prisma) for the generator's options, what it emits and overrides, and [Type mapping](https://typesql.karsli.net/reference/type-mapping#prisma) for the row types.

## License

[MIT](LICENSE)
