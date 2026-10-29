# @typesql/kysely

Write [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries against the `DB` interface you already have for [Kysely](https://kysely.dev), and run them on your Kysely instance. The interface can come from [kysely-codegen](https://github.com/RobinBlomberg/kysely-codegen), [prisma-kysely](https://github.com/valtyr/prisma-kysely), or be written by hand.

## Install

```sh
npm install @typesql/core @typesql/kysely kysely
```

## Usage

```ts
import { createSql } from "@typesql/kysely";
import { postgres } from "@typesql/core/postgres";
import type { DB } from "./db";

const sql = createSql(postgres, db);

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

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBAbzpAzjA5lApiuBfOAMyghDgCIABGATzBwEcAbAegGNosXUNsVyA3AChQkWIjhtsAQxhYAys3xESZKrXopmLANY0UWJjUEjw0eAiEBIDVjgBhCEwCuIAHYAVOlgA0123AA4lhuWFCyWAAmflYA0vqGNDEAChBomDgAIsDSTFhsMH4ExKQUegZGJqLmEqlOyiVqYOgmQgEAkm4wABxwALwOTq6e3gA81mhQwG7oMQBGwOjT8AA+cG6uc2Fwa5PTs9YLS10765vbuzBTM0IAfMIBHqA4MNLg-YMu7l70o5kRPjg-zkpz2M0BwLsl2u6HubW8cAAshAIJEPuQABbSMBgYyncgoaSRVrLMKEaRsOyZABCiGszgMUBQAC46VYrMBIqzgqFwnJIqMNiAtlA4eysCBpMAmKywehhOyQCiuUjlacNkwmAqrFIsBFIgB9WTckJhfWjJ4gF5vMBivAKngstkclU8s380adHpiqzSZwwDHQA2c1lCkXamDAGB5WVXfbasDOOZMYAoDFRE2881zFF5aRuO3CPBCIQcNxoOCROYfUIAdzg8QqND+1NuAApLFZIjk8gVQ1h66l0nxsrl8jAO8hc-3B7m2wBKfDzorz4RlitaJgfXURRRMNs8DIoQFV1cl9fwSLhQgwXADaS1qWXubWAB0FXHADFVG3yI7yPOb4fgUbYANrkJy5CAuQkbRlg5AALqAVYr61um2C-omyapumxLQX0UFELkBjIa+WAAB75P6WALsIpYQOW8B5pEYQ5tIUBogMm5ttYAAG8gAKIADICfYHhwM4ZGStKgKSUqqKAhwzhdAer6couACC8hTmgx5CHABmGUZxkmaZhnhG4OgLnAADyABqAkAEpwG2NmOZkTlwNSACakgQMpE5gGpkSLh58j2Jp2lgEwFJYPpZkJSZn6OTZiISYyuDOHAImfuJABSNntAAcjpt7ILZJVBX6AZBpyHySXVGlFZkyCvlhKZplE8WJT1cAAOoABJOQJEmvvJnFwAAJAAjN1vUJYEKUAKrJF5vkNZEvExJi2K4lBQhnhecAWToUQfA+T5wMxrEQOxkRkZRbDUbRJYXVGlZzK+Vz5oSBTAAxC4PVRchttIKA0G4bAuVc5GLn0txsm98Aw9YKHOGAkQRB40jJjRf5pLeAGo++WATkg7U4RmcBXM4dh4MhKFoWEePVYGUDBnhFAEYC00M0DT0g2evqPu9O5yHuB4E0egIw-OPHsrxHkiR4I3JalpW4INw1wKztUTTNcBNS1RU2eJFOdZtMRWNNMTzvzz1nvTdHcfxwmieJdVq2lDJhJrQ2OSN40fDNW0UPmmDGGeQA) <span data-playground="kysely"></span> to hover the types and edit the SQL, with nothing to install.

## Pin column types

Kysely describes columns with TypeScript types, so TypeSQL guesses the Postgres type: `number` is `int4`, `string` is `text`, `Date` is `timestamptz`. Rows come out right either way, but division, aggregates and date arithmetic can differ. Pin the columns where it matters:

```ts
import type { DefaultTypeMap } from "@typesql/core/postgres";

const sql = createSql<DB, DefaultTypeMap, { posts: { score: "float8" } }>(postgres, db);
```

For an interface generated with `kysely-codegen --camel-case`, pass `{ camelCase: true }` as the fourth type argument.

## SQLite

For a SQLite database, pass `sqlite` from `@typesql/core/sqlite` instead: `createSql(sqlite, db)`. The schema is converted to SQLite types; see [SQLite](https://typesql.karsli.net/guide/orms#sqlite).

## Documentation

See [From Kysely, Drizzle or Prisma](https://typesql.karsli.net/guide/orms#kysely) for how columns are converted, overrides, enums and camelCase, and [Limits](https://typesql.karsli.net/guide/limits#orm-schemas) for what the conversion can't tell.

## License

[MIT](LICENSE)
