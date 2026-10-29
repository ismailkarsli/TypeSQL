# @typesql/kysely

Write [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries against the `DB` interface you already have for [Kysely](https://kysely.dev), and run them on your Kysely instance. The interface can come from [kysely-codegen](https://github.com/RobinBlomberg/kysely-codegen), [prisma-kysely](https://github.com/valtyr/prisma-kysely), or be written by hand.

## Install

```sh
npm install @typesql/core @typesql/kysely kysely
```

## Usage

```ts
import { createSql } from "@typesql/kysely";
import type { DB } from "./db";

const sql = createSql<DB>(db);

const posts = await sql(
  `SELECT u.email, p.title
   FROM users u JOIN posts p ON p.author_id = u.id
   WHERE u.id = $1`,
  1,
).execute();

await sql.transaction(async (tx) => {
  await tx("UPDATE posts SET published = true WHERE author_id = $1", 1).execute();
});
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBAbzgYygUwIYzQZQI4A2cAvnAGZQQhwBEAAjAJ5hoDOhA9ANaOtoGMaAbgBQoSLEQiAkExZwAwhAIBXEADsAKszQAaGXLRwA4mnVooWNABN90gNK9+jOwAUIrGAHN0rACLAGARoyDD6pBRUtDx8AsJi4NDwSO7KJOSU1DRgXvEihnAAkuowABxwALyKympaOgA8Mp5QwOpedgBGwF6t8AA+cOpqHRZwA82t7TJdPSVjg8Oj4zAtbSIAfKIFmqBsMBjgldWqGtos9X5WunCX2PMTbde3RsurXpv5OnAAshAQ1kcaAALDBgMCCeY0VgYax5XoWMgYZBGPwAISk0hUfCgrAAXBjpMBrPjTOZLNhrPUhiARlAPtJpGgQBhgAR8Q8vKIGSA-sSfrz5kMCAQudJUJgKQB9LAkswWKyUnYgPYHMD04hcyCePEEomyskK+rFMr06QYFQwIHQSV6hY0iyimDAGDBdkrSaisAqDoEYCsIE2fXyin1Dp-YIYdTq0TEEQiZAQdSeODWDpHcwAdzgjlijAuqPWAAoEDJrIFgqF8Zm4O5PD42AEgiEYMW4JBlFW0FnUgRCwBKEh98J90QJpPwdhEKriqz4Aj5oupkdxsfJ6yWMgwVhHDAZlnwVMyAB0sWbADFMoXsh4tzQ+8fT6FCwBtGhEmjXGhOl1oGgAXXvaQjwzAN0CvL0fT9ANYU-CoP3III+EAo80AADxCC00H7UR40TZMI2sCwwwwKAASqSdCxkAADHAAFEABlaIUTQ4BUFDmVZa42J5f5rgTFQSkLMAjyJAcAEEcDbG9WH0OA5PkhTFKU5T5MsdQuH7OAAHkADVaIAJTgQstP0vwDLgVEAE0UAgASW2E0SblonAFHEySwAIJE0BEFTfOUs99K075WOxbcVDgRizxYgApLTCgAOSk7U220xLhPNS1rSJI42OysT4r8Nsjwg31-RsHy-MquSAHUAAkDNo1ijx4si4AAEgARgqqq-OMQKAFVXAs6zcusKi7GBUFwQ-ERl1XeA1K4Gwdz3Z04AIoiIBI6wUPQ5BMOwuNd33FMOiPFZI2hUJgETftdow7BCwwVhGHUZAjJWVCBwqdYMWOtbPpkICVDAawrE0DAfSw69tTvIGTzQFskBKqDAzgFYVCMYhAKAkCLGhjKrSgG0YNoODrg6nH7v2x7lzNVb4BnbA5wXQtPr7SiGSoszGM0RqAqCpKtzgOqGrgQmstazq4Hywr4q0liUbKsa7GkDq7D7amDuXbGcIomiGKYljsoF4KsQsbdRf0xqWqOTrxtoSMfEEZcgA) <span data-playground="kysely"></span> to hover the types and edit the SQL, with nothing to install.

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
