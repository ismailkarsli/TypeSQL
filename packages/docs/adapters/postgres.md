# postgres.js

`@typesql/postgres` runs your queries on postgres.js (`postgres` 3.x or 4.x). The two versions parse a few date values differently; see [Type mapping](../reference/type-mapping#dates).

```sh
npm install @typesql/core @typesql/postgres postgres
```

[Open an example in the TypeScript Playground](https://www.typescriptlang.org/play/?moduleResolution=100#code/JYWwDg9gTgLgBDAnmApnA3nAwhANnAXzgDMoIQ4AiAASVQGcBHXAegGNoUXJ6YBzKCnqUA3AChQkWBjhtBAQxgoAys0IkyFGnSHNuEXgKGiJ4aPB0zV+IqXJUe-QcPESAdkqjF5bNABEAIQwxAEgAV3oUKHoALmCQkOAAEzicXAAeSmAPABZKABoZAAt5ej8UbzDcGDiYKDC0AgA+cQSUEHlgXFS8TKUADxhKFtCQpOB6MFx5RAB9N3kQFB6MygGhwsw3KumAI1xlhHrGkYS5FEUUJNnFFb7QIRhFsBgALwLi0vLK6trjwlOBFajli8USKWwvSyHgAHB9MCUyhV5FUakcGgDWiEUTAitBZsk7tCYHlTiEYMAYAciethlinnxQWk+ihBgBtAC6dNCQLEBDEYiSKDY00Esggbl4cCSuzi1nEHEl8CY+AAvLIFEprOlAk0ABQygCUrkVUpBcHV8gA7p1lcw9aEAAbKACiABkXVgACpwZKFClUlD++SMuAAMQASgB5ACycHNAHUABIuiMuuAAEgAjBa4ABBAByAE04HqGfRDY78qFKCqCmJDQA6VnCsJKPXGgVCkXyMWm+AygLAPhy5jpTC7YfZNGTvjTzFiftwWe586XbW6g27Id8TbLqceP4YgidpccMIeei5622-d8B0hZ3uz0+nF4qAEpKFc8ePUAKkNfNlDgNxw2jONzQAcWjABVAAFOAAhLN98WSKsG2bfpW3bTsxBvSk4BVRs6nkSUfApCU9VKRA3DYUsYH6QDVSaeJ8IsfoH0feC-DzL103NV0fQDA5czCMBUCgMtKQOQDk1TdMUI-ZJc2zdCEgAdmrEImxbNg2xQDtWiXUDLRtAiGM4x0-GfPiwNjeMDBgK85LTWRe3GBZcEpRAyxDCtcwABjUnSsL0pQcAvGBDL5XCVT1J8PW9X0kjsiDHOclNXPLOBqBY1TClrZhKE7IA) <span data-playground="postgres"></span> to hover the types and edit the SQL, with nothing to install.

## Create `sql`

Pass your postgres.js connection to `createSql`. If the connection parses `int8` to `bigint`, pass `{ bigint: true }`:

```ts
import postgres from "postgres";
import * as pgjs from "@typesql/postgres";

const db = postgres(process.env["DATABASE_URL"]!);
const sqlJs = pgjs.createSql<DB>(db);
const posts = await sqlJs(
	"SELECT id, title FROM posts WHERE author_id = $1",
	1,
).execute();

const dbBig = postgres(process.env["DATABASE_URL"]!, {
	types: { bigint: postgres.BigInt },
});
const big = pgjs.createSql<DB>(dbBig, { bigint: true });
const counts = await big(
	"SELECT author_id, count(*) AS n FROM posts GROUP BY author_id",
).execute();

await sqlJs.transaction(async (tx) => {
	await tx(
		"UPDATE posts SET title = upper(title) WHERE author_id = $1",
		1,
	).execute();
});
```

It takes the `Sql` instance, the `TransactionSql` that `begin` passes, or a `ReservedSql`. Queries run with `unsafe(text, values)`, so the text reaches the server as written.

## Run queries

The `execute*` methods are the same as with [node-postgres](./pg#run-queries). `execute()` returns a plain array, without postgres.js' result metadata (`count`, `command`, `columns`).

Attach `.withPlugin(new CasePlugin())` (imported from `@typesql/core`) for [camelCase row keys](../guide/queries#camelcase-row-keys), and leave postgres.js' own `transform: postgres.camel` off.

## Transactions

`sql.transaction(fn)` is postgres.js' `begin(fn)`, and on a `TransactionSql` it is `savepoint(fn)`. A `ReservedSql` has neither, so there it sends `BEGIN`/`COMMIT` (and `SAVEPOINT` when nested) on the reserved connection. See [Transactions](../guide/transactions).

## Types

Rows are typed with `PostgresJsTypeMap`, which matches postgres.js' default parsers. Numbers, booleans, dates, JSON and `bytea` are parsed; everything else, including `int8` and `numeric`, is the text Postgres sent. Arrays are parsed element by element. The full table is in [Type mapping](../reference/type-mapping#postgres-js).

## Migrations

`migrate(db, m)` runs a [`migrations()`](../guide/migrations) builder's statements in one transaction. See [From migrations](../guide/migrations#running-migrations).
