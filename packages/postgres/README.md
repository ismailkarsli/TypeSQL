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
// { id: string; title: string }[]   (int8 is a string by default)

await sql.transaction(async (tx) => {
  await tx("UPDATE posts SET title = upper(title) WHERE author_id = $1", 1).execute();
});
```

If your connection parses `int8` to `bigint` (`types: { bigint: postgres.BigInt }`), pass `{ bigint: true }` as the second argument of `createSql`.

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBamgPYDOWA5gE6xEB0AVkaABQACWMVAjgDbCEkVUAlNVCIArrHIYqocmIB26bHiLdqCogEMAZrEZZYADywAaUADdNXCUUFnN8gCayCaIgCgQoTZVBs4zgBGkOg4mlj4xGSUNPT4PkRUAFygGPJYABypDJqgJFLypGYE5N6ggRikaRGYuKAAQpUAkunx5ERppKAE8tTu7hgAtoTkEf6woADeoADCBFxmAOKw8pLhsI5mAHJiXFyagVwTAL6g2uQEg6AARKzsqjwAxiWw1wDcA8MlEdOPlOvwbigU7nS43O5wB68KICIjvT4jMbsKagQFcYFnC5Xa58aJUeEDdKSbSaR4TAAi9Sm7gAkGJEu0UpNaTSMI4UstVuR1o4ADzXaoAFmuAD4PjSabBBpoMFwUnMuPyDMZReKaY4MERoPtIAB9eSaQawFI7PYHI5KoxYVUsv6wHm68IclZrAx865YIZULCG6BYABeNppx3FuKITJZbOdXJ5-OqGSDNM0YlwJV1Udm8zj6WFYpZnqwR3lWY9VsTPtI4czitLxgA2gBdIMh9zHfqOWCPfa+Z7yEigRyBFJot6gLy42GMHEwmJJEBcAiPKw4KLATTQaDXQTuXv9h6gAC8oDtAO4vMpIsYg8EHx3PX7YcP3jQMoiD0YtIABvAAKLIH8zOAqSbH42BHGYFYMAAYgASgA8gAspEJAMAA6gAEj+ME-qAAAkACMT4AIJbAAmkwkGCJ+Ji0tcDzXDRwhGJ2KZ6DenhgKAXEAHoAPz9F4cGKLkvarI8no9EodSfuMVbTBUVTpCkE4xNQjSkC0ETHNRqTpFkDjOM8ChYIwABUgjHpcEyBKSADW3gMAp1R9B2XY+BMu4RIO6nDme8mVNUKROa0xx5p55SVE+J4GGi571Je3mVGY-mKVgKRYHIJzseFRnpAwR6aC+2ARaQH40t+f4AUByapuQ6YgblJnmaARHwKAiiwYhyFYAwizwQAqgACg05E1SudVstR7hMYYLEGIw7FeFxoB8QJYAPNQGUOFo4kYJJmp5GogSwIpo5YIYm3cn2pISYoB25Fo5iwIQznuIVr6HVwl3bTde3yIwmhEJA8iPBRhgWQeIrUkmRVjIYZXlUN5JEeAOGPr+QEFkcT5iBukj6GBsAWRhWE4WNaZsk+BFTRKADsNE0jNc1seK4WKAVsN+PDLKfuSlWo6AnVIY+JPYcePgagaXDYJA+iaJWEOgAADDTTOPKxczGQt4pLTx-HHOx7jvhV-6AcBgvwcLURoZhYuQaAzBQ9TZh0dwW6jl4kgXOQ6Xywwjt+JotkyLkypYI27hAA) <!-- playground:postgres --> to hover the types and edit the SQL, with nothing to install.

## Documentation

- [postgres.js adapter](https://typesql.karsli.net/adapters/postgres): running queries, transactions and migrations
- [Type mapping](https://typesql.karsli.net/reference/type-mapping#postgres-js): the TypeScript type of every Postgres type

## License

[MIT](LICENSE)
