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

await sql.transaction(async (tx) => {
  await tx("DELETE FROM posts WHERE author_id = $1", 1).execute();
});
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBDAnmApnA3nAwhANgGjgHEUA7FKAQxhQBNCA5AV110oCNc0BfOAMygQQcAEQABJKgDOAR1wB6AMbQUIgNwAoUJFgY4iqCmooAynMKS0ABSjApISgCVKAdyy5gZeLwFDRE5BRZBTBbe0p1DS1SGig+SkU0ABEAIQwNAEgmKQopAC50jIzgWgKScioaWgAeEWAYgBYRAD5NIpQHYFwCnFxagDdKKEUACyGWtozaOzA2RAB9UkoQFALmVg4uWpoADxgJzIzBLjKyCmMakUc8VVbDpjBaC4BBGB68bdAgmGWwA4zuG1IFIYPlCsVStgPiImEwSv8MpQmDARtB5iV3n06o0ETBgDATlCsbt9nciv1PC4weVzlVavUYAAOf6AzIAEksYPQh2uhJEzySAFkAJIMERwAA+ogAqiYAKKOSIAzTcKK0FCKNiGfQQUgguChOwOAo2I1OVzuTwxTTKPXwYJwAC8+kMxjMfVSzQAFIbwgBKTQaW36yi0ED1KROuCuSj4uDBL2ZAAG8oAMnKsAAVOAlQjTKSzSgLJYrQgwx4vfZwABijgA8oK4NlcnAAOoACQVcrgxzQzrZAEYk-hMvyhaKRCO-QA6FA7DXIlBegNRYP2n6gqMxuMJ5NpjPZpEotG5nVMGJegBUfrgzxMBogIKkhCkTBAXopKCpN7vcE-VJretG2BTciHraUrDgFIAE1o2RVEoHRWhhw0Gc5wXGhl0DNc4HVLgqi3FxY3tORpxgKg9QSPFdS9L0YB2G9HWaTJ6K9JMkjldNM27WsGwfJ8207RxuyPBCkKjQdhzgAc0PnRRFxwc8YGXKdAwTJNRXlRxs1FTM634zcvVEk96AQfEuBvAA1Z5U2lOV7y9QdCDZAAmP0pIHMt2xQVgIBEFcgA) <span data-playground="prisma"></span> to hover the types and edit the SQL, with nothing to install.

Good to know:

- Rows are typed the way Prisma's raw queries return them: `int8` (so `count(*)`) is `bigint`, `numeric` is `Decimal`.
- `uuid()`, `cuid()`, `nanoid()`, `ulid()` and `@updatedAt` are filled in by Prisma Client, not the database, so a SQL `INSERT` must set them.
- Without the generator, `createSql<Prisma.TypeMap>(prisma)` reads the types Prisma Client already generates. They don't record `@map` names or native types, so you may need overrides.

## Documentation

See [From Kysely, Drizzle or Prisma](https://typesql.karsli.net/guide/orms#prisma) for the generator's options, what it emits and overrides, and [Type mapping](https://typesql.karsli.net/reference/type-mapping#prisma) for the row types.

## License

[MIT](LICENSE)
