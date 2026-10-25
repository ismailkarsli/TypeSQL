# @typesql/kysely

Write [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries against the `DB` interface you already have for [Kysely](https://kysely.dev), and run them on your Kysely instance. The interface can come from [kysely-codegen](https://github.com/RobinBlomberg/kysely-codegen), [prisma-kysely](https://github.com/valtyr/prisma-kysely), or be written by hand.

## Install

```sh
npm install @typesql/core @typesql/kysely kysely
```

## Usage

```ts
import { createSql } from "@typesql/kysely";
import type { DB } from "./db"; // the interface you pass to new Kysely<DB>()

const sql = createSql<DB>(db); // db: your Kysely<DB> instance, or a transaction

const posts = await sql(
  `SELECT u.email, p.title
   FROM users u JOIN posts p ON p.author_id = u.id
   WHERE u.id = $1`,
  1,
).execute();
// { email: string; title: string }[]

await sql.transaction(async (tx) => {
  await tx("UPDATE posts SET published = true WHERE author_id = $1", 1).execute();
});
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBagNKQDOsANpKABQACWMsRAjqcANbFmQCUAdKAJoB7AK4AnAh3KgAIgCFQGAHZZYogGYBDAMawq7EuQC0WwQBNYAc1iLQIrNGFZbogFAhQODYtOG0o7CqKXApEoLi6RFo4sAC2GgA0oF6moKIaaKBIqKLCiqGCNpAi4oQGFEpEWF46fAASggBuqmHRqQzCpFhEPC4uGDHQgqJOAN6gWqKwGirwzKAAvqBqooIxoABEtPRMLPqc6wDcfQNDoy4AkHRwoADCgqTCMYpQcPEXV7oA4taq07Cmb3OpU4gIACoJKhZJkRpBgNKRYFosG9FstVhs9uRDsdBsNQGNwfcFksVmt1tALNi3GBMZBjGZLNZbI4HMiwv4YjF-i4PqAAJLKAAcoAAvLd7o9nvQADwXSr+RQWQEAIwwFiUTgAPqBFI9lc1tfKlEqLqr1cpQNrdTF9eJDVgFRYXAA+I688D9BhVAai8UPJ4vWDS6R-RIhlSW0BGxVhv6R6MWV08+igACygjMvvWnmg0Eg60j6yIGlMVI1qk0Ohk8hGF2EJFERAAXPiLucMKYW99FL8VKZpdbbUnzudYhoMKQWwmjiOYhnO2n55HdaRSDPzhMpn2APrTLs-NJ96UermVDQDYfzGeDSrN1sjjv7nuH-7SgVYQXD84aRw4Ibbx8dT1VR1ywbAESnB1jXXBxlVIDAiGiBdu17V9lQzBEvEvI55l6Ew8icUxlV9HsMmBchg1kZ1KFrc5TDhBEkRbUjQHBSFoVheFESwGjQEGe5mNgDJCVIShgnmLgUS4I58MqKM5jFTc-lmUhKOoojpN6dxwFaRhhFUChlWECdzHENQhnQTwnGwUBTEEBh0DIUhEiyJYLPCNpKkSKJEVYf4kgsccCJaCJz10Ko4IYHpZMItI1C6X10nHQjlQuHgDG4gAxUlKHJCEunWLg0oypFKAAbXWDt1kSdYwKwBF1gAXSK84eDQaJJly2D4MQ-5qo2EV+s0UgSBanhYAAD0RRxYDEo4XBi0BMNM9CNFEFIxR2SgLgAA3gABRZB9pucBQGEca4gnRJzrnMxvJEZRKGgHgO2CABBeA+Pyog3lAP7-oBwGgeB-60kUVgxNAAB5AA1faACUqCh+HpAR0BZH4cYHp457Xpkfb4Bud7PugUhtFgFwQap4HMvhqHUzOhtQmEUAjsy06ACkob5AA5L7bz46G+een9cH-DtfXOiW3p56Q+J4bqEKQynqdVv6AHVagR-azp4W6NtAAASABGFW1epz46YAVVBdHMal0wdsBbMNFzfM3k0xawb8g2kps5bVFW9bxqmrQZrm6kAYAPQAfi0sABSIDtdA0CQynZLxiyRDACkSVVvCSeTSDCQQFCcLBS5iDAJtAIyTOaZJMhQUA9NUDAopcP2Up4B1M+0MCCjEkPppUSgNCISBFC0KgHQm4IRWde8u-ZCa2x4YRoFMP5wA0SKuu+wq15IHixkV3qFwdfSFha1r2tUWb1lFv9RAA0sasGxJjZv4ew9HzTvzQMlcYkxlLMDUpQWeXBtojh2qjI64Ada03pvzBKmttZJF-OLA2JtQAyzljzKGp0z5ISdm2Y2gJeCTRHrNTSEl5pbT2odY6p0JZIIZvWVQoQ0Hwx1vrX0JsnYbC8FCfM0lQDuFUCsUQzFBBOFTg0eEV9BBqBCqAPh1hHguCAA) <!-- playground:kysely --> to hover the types and edit the SQL, with nothing to install.

## Pin column types

Kysely describes columns with TypeScript types, so TypeSQL guesses the Postgres type: `number` is `int4`, `string` is `text`, `Date` is `timestamptz`. Rows come out right either way, but division, aggregates and date arithmetic can differ. Pin the columns where it matters:

```ts
import type { DefaultTypeMap } from "@typesql/core";

const sql = createSql<DB, DefaultTypeMap, { posts: { score: "float8" } }>(db);
```

For an interface generated with `kysely-codegen --camel-case`, pass `{ camelCase: true }` as the fourth type argument.

## Documentation

See [From Kysely, Drizzle or Prisma](https://typesql.karsli.net/guide/orms#kysely) for how columns are converted, overrides, enums and camelCase, and [Limits](https://typesql.karsli.net/guide/limits#orm-schemas) for what the conversion can't tell.

## License

[MIT](LICENSE)
