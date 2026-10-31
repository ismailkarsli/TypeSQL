# @typesql/postgres

Run [TypeSQL](https://www.npmjs.com/package/@typesql/core) queries on [postgres.js](https://github.com/porsager/postgres) (`postgres` 3.x), with rows typed the way postgres.js returns them.

## Install

```sh
npm install @typesql/core @typesql/postgres postgres
```

## Usage

```ts
import postgres from "postgres";
import { createSql } from "@typesql/postgres";
import type { DB } from "./schema";

const sql = createSql<DB>(postgres(process.env.DATABASE_URL!));

const posts = await sql("SELECT id, title FROM posts WHERE author_id = $1", 1).execute();

await sql.transaction(async (tx) => {
  await tx("UPDATE posts SET title = upper(title) WHERE author_id = $1", 1).execute();
});
```

If your connection parses `int8` to `bigint` (`types: { bigint: postgres.BigInt }`), pass `{ bigint: true }` as the second argument of `createSql`.

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/?moduleResolution=100#code/JYWwDg9gTgLgBDAnmApnA3nAwhANnAXzgDMoIQ4AiAASVQGcBHXAegGNoUXJ6YBzKCnqUA3AChQkWBjhtBAQxgoAys0IkyFGnSHNuEXgKGiJ4aPB0zV+IqXJUe-QcPESAdkqjF5bNABEAIQwxAEgAV3oUKHoALmCQkOAAEzicXAAeSmAPABZKABoZAAt5ej8UbzDcGDiYKDC0AgA+cQSUEHlgXFS8TKUADxhKFtCQpOB6MFx5RAB9N3kQFB6MygGhwsw3KumAI1xlhHrGkYS5FEUUJNnFFb7QIRhFsBgALwLi0vLK6trjwlOBFajli8USKWwvSyHgAHB9MCUyhV5FUakcGgDWiEUTAitBZsk7tCYHlTiEYMAYAciethlinnxQWk+ihBgBtAC6dNCQLEBDEYiSKDY00Esggbl4cCSuzi1nEHEl8CY+AAvLIFEprOlAk0ABQygCUrkVUpBcHV8gA7p1lcw9aEAAbKACiABkXVgACpwZKFClUlD++SMuAAMQASgB5ACycHNAHUABIuiMuuAAEgAjBa4ABBAByAE04HqGfRDY78qFKCqCmJDQA6VnCsJKPXGgVCkXyMWm+AygLAPhy5jpTC7YfZNGTvjTzFiftwWe586XbW6g27Id8TbLqceP4YgidpccMIeei5622-d8B0hZ3uz0+nF4qAEpKFc8ePUAKkNfNlDgNxw2jONzQAcWjABVAAFOAAhLN98WSKsG2bfpW3bTsxBvSk4BVRs6nkSUfApCU9VKRA3DYUsYH6QDVSaeJ8IsfoH0feC-DzL103NV0fQDA5czCMBUCgMtKQOQDk1TdMUI-ZJc2zdCEgAdmrEImxbNg2xQDtWiXUDLRtAiGM4x0-GfPiwNjeMDBgK85LTWRe3GBZcEpRAyxDCtcwABjUnSsL0pQcAvGBDL5XCVT1J8PW9X0kjsiDHOclNXPLOBqBY1TClrZhKE7IA) <span data-playground="postgres"></span> to hover the types and edit the SQL, with nothing to install.

## Documentation

- [postgres.js adapter](https://typesql.karsli.net/adapters/postgres): running queries, transactions and migrations
- [Type mapping](https://typesql.karsli.net/reference/type-mapping#postgres-js): the TypeScript type of every Postgres type

## Prepared statements

```ts
const findPost = sql.prepare("SELECT id, title FROM posts WHERE author_id = $1");
const posts = await findPost(7).execute();
```

Reuse `findPost` with new values. TypeSQL assembles the SQL once and enables postgres.js prepared statements for execution, including queries without parameters. The driver's global `prepare: false` option is respected. All `execute*` methods work. Named parameters and fixed fragments are supported too. Inside a transaction, use `tx.prepare(...)` to bind it to that transaction.

## License

[MIT](LICENSE)
