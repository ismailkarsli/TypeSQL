# TypeSQL

[![PostgreSQL 18 regression suite: 49,999 of 49,999 checkable statements agree](https://img.shields.io/badge/PostgreSQL%2018%20regression%20suite-100%25%20agreement-336791?logo=postgresql&logoColor=white)](#tested-against-postgresqls-own-test-suite)

Type-level Postgres SQL for TypeScript. You write a SQL string literal; the compiler parses
it **inside the type system** and gives you the exact row type, the parameter types, and
(for DDL) the resulting schema. No codegen, no database connection, no build step. The parser
agrees with Postgres on [every checkable statement of PostgreSQL's own regression tests](#tested-against-postgresqls-own-test-suite).

![TypeSQL demo: highlighted SQL with table and column completions inside a query, hovering a query shows its inferred row type, and a misspelled column is a compile error](assets/demo.gif)

**[Try it in the TypeScript Playground](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZAXKACgewM4BcBzAJ1h1CWQBpRoBDInWAE1ACNIIYEBjIgS2h4A5GTxdQOSPlgBbAHSgAokz55QeABaxyKULQB2LDVgBusIuq3quOVACgQoIlgDuZAyzpFaM2HnNkAGZYADYhrtQeoDJ8+LQA1qR6JKDcWDLQfCHa5s4MoFj6ltr4-PoEcnZ8GVhEagDedgCQYnCgAMKhlM28sLT+8ACOId0t4gDisPrm-cyjrdoAcgCuYbSs2fPiGPQ+OFBwW20ASq4HsN0AvqCBzjKgAEQAAgs4w8BpJA8A3HZV+v4iIFaNxtAARABCoEaTWWjAY6BhTT4THQk2m3n8TAAPA8+ACACwPAB831Ajg0tHcoCYsGBqzw6Cwgj4hVoIQKRQAkot4IpjuBmk1ZLQsuhOiFcf4AB54Em-JpNFQ4aAhWiQAD6+h8sHQKzWG1gUtgsvlQt6syYGv6aKmMyxUuqpDwPkEAC8zU1LgroLg8LZoUKUbaMZbcfi8AAOT1NWjLTS1DXBjqhcOEmN4VTZcWph4yuWkoWsLBMSB61Zqw3G02Fr2-S5-NL6fASYagAC8qRIsyGkshxIAFABKX4OMDIRQAMXAoAAUgB5HnRBJJTTafgEDRqHAo7T6CvrbJkgAkAEZ1CuyKpROJbulQMs5CjKk2W4MO62QgPmgADPkT9oZ0fFFqEfEUsmoaA5EzPBsjsUAEMQpDkMnY55wAWQfeEyGWUAJ2nOdF0WGg-TIaBQHnYioLjBMiCTFhO2Aph4OQ1jEIAdQACX5RQHyfBjQDPH9RgAdm6Ec7AWUBThcD8ZPObEFiwQJQEGQtHAQgA9AB+STtl2GQyE7HZvEMhSlJUtTfg00AdL+RwAEECGIWACFmdxDFSUJlhkIptV8IJQnCWTsHwFyAzSZYAQHAAqIdQFiBKAUjSIJDwMoCAfQxzFAfQS1gABaX0wpIHAX0KFs4n9D83i-X9-0UQC9HjYw6JAryorwWKh2oGRaGlAcYOyeKHPgUA1X8FtUIwkj8DIcY0IAVQwUAIQATWa2j6OEuwJKk+AXWqzt5K4RSuGUtL+hwdSwC03Sx1ALl9BCfFtBMdlliSegSimNQqUEoovB1QEPJYbgtG4RIWFoNz8RbFwtBSNcOG+rDmHK5s1HAjlOweWgmFoJ4TVdbI5DSGQfjsV81AtLEauGb8mh-Hk+QFR7FnAec0fyAdsfigA1BzkEWxQxoHY96lquQgZkXm+qyIdLni45FHARbjkWHlxgSphqFp5hrTwHa9vEdpuzp46zlOiyuz6LEbsQuyHvQ2IXUSdwUnJzJslAXJajIQpih0ZA0oyhRJz4aVihkexaoHP9FAAmd9F8UBpswuEAh-EdyTAP2iHQNIQh8ooHhT2AHhpLAkjyrHpVduw4+Z3l+RnHlOdm6rBqzWABaFkWxbPIdhMeTjYDCLAHhzxx8-QGjWvohKyEWecZ0WRbkBDqJKTIPKaTpOMQjwOwgA)** <!-- playground:core -->: edit the SQL and hover the types,
with nothing to install. The Playground runs TypeScript 6, which TypeSQL does not support, so treat
it as a demo; TypeSQL requires TypeScript 7.1.

```ts
import { createSql, type Col, type Generated, type Nullable } from "@typesql/core";

interface DB {
  users: {
    id: Generated<"int4">;          // has a default → optional on INSERT
    email: Col<"text">;
    display_name: Nullable<"text">;
    created_at: Generated<"timestamptz">;
  };
  posts: {
    id: Generated<"int8">;
    author_id: Col<"int4">;
    title: Col<"text">;
    body: Nullable<"text">;
  };
}

const sql = createSql<DB>();

const q = sql(`SELECT u.id, u.email, p.title
               FROM users u LEFT JOIN posts p ON p.author_id = u.id
               WHERE u.id = $1`, 7);
//    ^? Query<{ id: number; email: string; title: string | null }, [number | null]>

// values inline, sent as $n parameters and type-checked against their context
sql(`SELECT id FROM users WHERE email = ${sql.param(email)} AND id > ${sql.param(10)}`);

sql("SELECT nme FROM users");
//   ~~~~~~~~~~~~~~~~~~~~~~  Argument of type '"SELECT nme FROM users"' is not assignable to
//                           parameter of type 'SqlError<"column \"nme\" does not exist", 1>'
```

The runtime is a thin object `{ text, values }`; `@typesql/pg` and `@typesql/postgres` run it.
Already using Kysely, Drizzle or Prisma? `@typesql/kysely`, `@typesql/drizzle` and
`@typesql/prisma` take the schema from it.

```ts
import { createSql } from "@typesql/pg";             // pg's type map, queries run on the pool
const sql = createSql<DB>(pool);

const posts = await sql("SELECT id, title FROM posts WHERE author_id = $1", 1).execute();
//    ^? { id: string; title: string }[]
const user = await sql("SELECT id, email FROM users WHERE id = $1", 7).executeTakeFirstOrThrow();

await sql.transaction(async (tx) => {                // tx: sql bound to one transaction
  await tx("UPDATE posts SET title = upper(title) WHERE author_id = $1", 1).execute();
});
```

## Editor completions

The TypeSQL extension for VS Code
([Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=typesql.typesql),
[Open VSX](https://open-vsx.org/extension/typesql/typesql)) suggests what can come next inside
`sql()` strings: tables, views and schemas after `FROM`, `JOIN`, `INTO` and `UPDATE`, and
columns with their Postgres types after `alias.` and in expressions. It is an optional
companion: TypeSQL checks statements and infers row types without it, so install it only if you
want completions.

```ts
sql("SELECT * FROM |");          // users, posts
sql("SELECT u.| FROM users u");  // id: int4, email: text, display_name: text | null
```

The names come from the `DB` type of the `sql` you call, unsaved edits included. Errors, hovers
and row types stay TypeScript's own. It needs `@typesql/core` 0.4.0 or later and a language
server on TypeScript 7.1; [Editor completions](packages/docs/guide/editor.md) covers the setup.
The extension also highlights the SQL in these strings, with no setup. The source is in
[`packages/vscode`](packages/vscode).

## Packages

| Package | Role | Peer dependency | Playground |
|---|---|---|---|
| [`@typesql/core`](packages/core) | type engine | none | [open](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZAXKACgewM4BcBzAJ1h1CWQBpRoBDInWAE1ACNIIYEBjIgS2h4A5GTxdQOSPlgBbAHSgAokz55QeABaxyKULQB2LDVgBusIuq3quOVACgQoIlgDuZAyzpFaM2HnNkAGZYADYhrtQeoDJ8+LQA1qR6JKDcWDLQfCHa5s4MoFj6ltr4-PoEcnZ8GVhEagDedgCQYnCgAMKhlM28sLT+8ACOId0t4gDisPrm-cyjrdoAcgCuYbSs2fPiGPQ+OFBwW20ASq4HsN0AvqCBzjKgAEQAAgs4w8BpJA8A3HZV+v4iIFaNxtAARABCoEaTWWjAY6BhTT4THQk2m3n8TAAPA8+ACACwPAB831Ajg0tHcoCYsGBqzw6Cwgj4hVoIQKRQAkot4IpjuBmk1ZLQsuhOiFcf4AB54Em-JpNFQ4aAhWiQAD6+h8sHQKzWG1gUtgsvlQt6syYGv6aKmMyxUuqpDwPkEAC8zU1LgroLg8LZoUKUbaMZbcfi8AAOT1NWjLTS1DXBjqhcOEmN4VTZcWph4yuWkoWsLBMSB61Zqw3G02Fr2-S5-NL6fASYagAC8qRIsyGkshxIAFABKX4OMDIRQAMXAoAAUgB5HnRBJJTTafgEDRqHAo7T6CvrbJkgAkAEZ1CuyKpROJbulQMs5CjKk2W4MO62QgPmgADPkT9oZ0fFFqEfEUsmoaA5EzPBsjsUAEMQpDkMnY55wAWQfeEyGWUAJ2nOdF0WGg-TIaBQHnYioLjBMiCTFhO2Aph4OQ1jEIAdQACX5RQHyfBjQDPH9RgAdm6Ec7AWUBThcD8ZPObEFiwQJQEGQtHAQgA9AB+STtl2GQyE7HZvEMhSlJUtTfg00AdL+RwAEECGIWACFmdxDFSUJlhkIptV8IJQnCWTsHwFyAzSZYAQHAAqIdQFiBKAUjSIJDwMoCAfQxzFAfQS1gABaX0wpIHAX0KFs4n9D83i-X9-0UQC9HjYw6JAryorwWKh2oGRaGlAcYOyeKHPgUA1X8FtUIwkj8DIcY0IAVQwUAIQATWa2j6OEuwJKk+AXWqzt5K4RSuGUtL+hwdSwC03Sx1ALl9BCfFtBMdlliSegSimNQqUEoovB1QEPJYbgtG4RIWFoNz8RbFwtBSNcOG+rDmHK5s1HAjlOweWgmFoJ4TVdbI5DSGQfjsV81AtLEauGb8mh-Hk+QFR7FnAec0fyAdsfigA1BzkEWxQxoHY96lquQgZkXm+qyIdLni45FHARbjkWHlxgSphqFp5hrTwHa9vEdpuzp46zlOiyuz6LEbsQuyHvQ2IXUSdwUnJzJslAXJajIQpih0ZA0oyhRJz4aVihkexaoHP9FAAmd9F8UBpswuEAh-EdyTAP2iHQNIQh8ooHhT2AHhpLAkjyrHpVduw4+Z3l+RnHlOdm6rBqzWABaFkWxbPIdhMeTjYDCLAHhzxx8-QGjWvohKyEWecZ0WRbkBDqJKTIPKaTpOMQjwOwgA) <!-- playground:core --> |
| [`@typesql/pg`](packages/pg) | driver | `pg` ≥ 8 | [open](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBagHYD2AJrALTSEDOWA5gE6xWgAUAAljEwI4A2w0WgEoAdKEQBXWPQxNQ9CflCElkQhPqgACoUK8ANKACG+YvMJpmRxqE5wzAI0jocRrACgQoQQHJmpADMjCV4sb2sqaWZGLA18AC5QDHwsAA5jUwIJAFtpDABjY2YaGXxaKkMsDFyaI2zoK2YAETdYMQAJQgA3aVscWHkmEKwqEXd3asp6MLsBgG9QAGE9QwBxWHxpVuJDADkQ3iMHXgGAX1AA+kJs0AAiDi4qPmB8wkZbgG4J+rewhfzGK14HxQOdLtc7g84E9+IJPt8pn9tLpeKCLlcbrc4V9PGAAOoyLADXAYZhOUCuUyGN6gWgbLZEpJhcE3NQaUDENxHIyRRIAA1mMKSKSuVDg+TCZDIGlRgDICUBS9RhKj5frZIwiEZ8iYpaRBfIDJoAIVAc3cAEgJJF6FREmbzeaMMREutNvRtgAeW7JLAAFluAD4vg7YOqMLxEsteF6iQAPLCB4Pm4ik6CHSAAfXwdVgiX2vEOx1gMdg8cTFvNDiMh3wBsjei9+ByeXy5YdANg2wzbhd9PdROIMeqTCwdWgWAAXm3TsHKDRbaaK07e27Pd6Uqk2+bgrg3hnl0sG+u-VuqlgTvXo7c4wmgxXoBJjqT+sRu1g8wcjichzVR-VJ9OXynOMrz4DQ3goqAAC8BCwGgyJ6Cw-wqJsEoYCo8BYKUtCJFi1B0IwtogLwhD5NWOD4cARjQNAtygkIXygeBQowR2QJ8B6xoBiwlB6AxIEqOBTgAIISLumgwTCLAWny8AAKLIHJizgN4IhOoY0CatgJwaSID5PlQL5voYEgiKGRjhu4oDWTZtl2fZoAAGIAEoAPIALIQfO3igAAUq5ACSuygFaUQhaArnBaZTrQapO4UfQ+7EFZDmpfZeLtHJzlyXFYkJUlsUACQAIx8voFoAOzlfxTFhHOIyxUYaAWWEIl5W8ZmxrA+RibALD8V4NkAHoAPwCWBYShRJxjNdgoBSTJ8mKcpSQ7KAVY1gahhsQOb5OW5nlTcwGVZTl5nhkVpXleatxGJybClmOJwiK82S3NVnXdb14BGAA1rAjkYDaWCufQ4A4FcaD9V8g3WaN43ga8igNTBTUtfNfDSeaskKUpKnxXu6mgEjKQsAAVEIoDCfABD7R5XkNasbkAKpaKARoAJrGO1iVOmV7iiKWX1EtDuK2fDYtYLGSTFCCDjqJkWCEMomy2O6YFGGhKiRh57kBSpaD9EouADAEiha0ohF6D0FSgG5yDIEawmLAA0i4GxMn0kOjO4tUMwFZio7Nyp8Jq6tUJrVQqCwPKQLWrBS5TUEBou5qDfD5p+wsMXnEH6NS1j2NBfJzkqUF4CuSF1rMCw50GOt1YmAalMAGrCcgzNyTTLAlYYhUAEyU9l4DM85uxBasq38w6twMJrsAPbGT1tK970VgADNdgtdT1RI-f9gPA6D4OQ6LmeCXV+GNcHtixoXfLF1lZe7BXDM1wTvNrWeJyt+3nfd73UAA8h5yRHmPCeU9rqOh2BWW47RYAFkIGvc029hawH3gDIGNBj4QwsGfGIcQGZqWIEBfiYstDWBzESG0xgbCqm6v9MwRhaAWQmn0WAQNiZ6ByAkbm4kCqkmFH6MYaM5pST5E0XG4AcouXpvVY6mVsp8PyjFGCJUyp3AqrcVBu8+oMVAF4aQVx6CJCMPNLCyRaAywIIQMIJghG+ncEAA) <!-- playground:pg --> |
| [`@typesql/postgres`](packages/postgres) | driver | `postgres` ≥ 3 | [open](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBamgPYDOWA5gE6xEB0AVkaABQACWMVAjgDbCEkVUAlNVCIArrHIYqocmIB26bHiLdqCogEMAZrEZZYADywAaUADdNXCUUFnN8gCayCaIgCgQoTZVBs4zgBGkOg4mlj4xGSUNPT4PkRUAFygGPJYABypDJqgJFLypGYE5N6ggRikaRGYuKAAQpUAkunx5ERppKAE8tTu7hgAtoTkEf6woADeoADCBFxmAOKw8pLhsI5mAHJiXFyagVwTAL6g2uQEg6AARKzsqjwAxiWw1wDcA8MlEdOPlOuNUgtLDwbhmP6wdagrigU7nS43O5wB68KICIjvT4jMbsKagaGws4XK7XPjRKiYgbpSTaTSPCYAEXqU3cAEgxIl2ilJmzWRhHCllqtyOtHAAea7VAAs1wAfB9WazYINNBguCk5lwJQZjHKFazHBgiNB9pAAPryTSDWApHZ7A5HbVGLB63kQ0Vm8KClZrAzi65YIZULBW6BYABertZxwVZKI3N5-O9wtFEuqGSjrM0YlwJTNSdm8zT6Rl8t5gawRw1RYDzszIdI8cLWtrxgA2gBdKMx9zHfqOWCPfa+Z7yEigRyBFLQt6gLxk9GMUlomJJEBcAiPKw4KLATTQaDXQTuUfjh6gAC8oHdBmhYqZssYk8EHxPPXHccv3jQqoiD0YbIAAbwAAosgIEzOAqSbH42BHGYDYMAAYgASgA8gAspEJAMAA6gAEiBKEgaAAAkACMX4AIJbAAmkwiGCIBJhstcDzXCxwhGIOOZ6C+nhgKAQkAHoAPz9F4aGKLko6rI8gY9EodSAeMTbTBUVTpCkC4xNQgLArCzGpOkWQOM4zwKFgjAAFSCNelwTIEdIANbeAwGnVH0A5Dj4EynhEk6AtO3BiuplTVCkHmtMcZb+eUlRfjesD6ekd4Pk+gSAvxcUWekDBXpoP7YPFpAAaywFgRBUHZrm5D5jBuVWbZoBUfAoCKKhmHYVgDCLOhACqAAKDT0TVO51fyzHuFxhg8QYjD8V4QmgGJElgA81BYCKY50gpihGnkaiBLAmmzlghibdtWjyRgikHbkWjmLAhCee4hW-odXCXQ4117YwmhEJA8iPAxhh2ResoslmRVjIYZXlUNDJUeAJGfqBUEVkcX5iAekj6HBsB2QRREkWNeb8l+FFTYqADsLGsjNc18QqcWKAVMN+HDvKAQylUo6AnVYZ+xPEdePiGpaXDYJA+iaI24OgAADNTjOPLxcyWQtCpLSJ4nHPx7j-hV4GQdBAvoULUR4YRouIaAzCQ1TZhsdwR6zl4kgXOQKR2w7fiaM5Mi5DqWCdu4QA) <!-- playground:postgres --> |
| [`@typesql/kysely`](packages/kysely) | ORM schema | `kysely` ≥ 0.27 | [open](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBagNKQDOsANpKABQACWMsRAjqcANbFmQCUAdKAJoB7AK4AnAh3KgAIgCFQGAHZZYogGYBDAMawq7EuQC0WwQBNYAc1iLQIrNGFZbogFAhQODYtOG0o7CqKXApEoLi6RFo4sAC2GgA0oF6moKIaaKBIqKLCiqGCNpAi4oQGFEpEWF46fAASggBuqmHRqQzCpFhEPC4uGDHQgqJOAN6gWqKwGirwzKAAvqBqooIxoABEtPRMLPqc6wDcfQNDoy4AkHRwoADCgqTCMYpQcPEXV7oA4taq07Cmb3OpU4gIACoJKhZJkRpBgNKRYFosG9FstVhs9uRDsdBsNQGNwfcFksVmt1tALNi3GBMZBjGZLNZbI4HMiwv4YjF-i4PqAAJLKAAcoAAvLd7o9nvQADwXSr+RQWQEAIwwFiUTgAPqBFI9lc1tfKlEqLqr1cpQNrdTF9eJDVgFRYXAA+I688D9BhVAai8UPJ4vWDS6R-RIhlSW0BGxVhv6R6MWV08+igACygjMvvWnmg0Eg60j6yIGlMVI1qk0Ohk8hGF2EJFERAAXPiLucMKYW99FL8VKZpdbbUnzudYhoMKQWwmjiOYhnO2n55HdaRSDPzhMpn2APrTLs-NJ96UermVDQDYfzGeDSrN1sjjv7nuH-7SgVYQXD84aRw4Ibbx8dT1VR1ywbAESnB1jXXBxlVIDAiGiBdu17V9lQzBEvEvI55l6Ew8icUxlV9HsMmBchg1kZ1KFrc5TDhBEkRbUjQHBSFoVheFESwGjQEGe5mNgDJCVIShgnmLgUS4I58MqKM5jFTc-lmUhKOoojpN6dxwFaRhhFUChlWECdzHENQhnQTwnGwUBTEEBh0DIUhEiyJYLPCNpKkSKJEVYf4kgsccCJaCJz10Ko4IYHpZMItI1C6X10nHQjlQuHgDG4gAxUlKHJCEunWLg0oypFKAAbXWDt1kSdYwKwBF1gAXSK84eDQaJJly2D4MQ-5qo2EV+s0UgSBanhYAAD0RRxYDEo4XBi0BMNM9CNFEFIxR2SgLgAA3gABRZB9pucBQGEca4gnRJzrnMxvJEZRKGgHgO2CABBeA+Pyog3lAP7-oBwGgeB-60kUVgxNAAB5AA1faACUqCh+HpAR0BZH4cYHp457Xpkfb4Bud7PugUhtFgFwQap4HMvhqHUzOhtQmEUAjsy06ACkob5AA5L7bz46G+een9cH-DtfXOiW3p56Q+J4bqEKQynqdVv6AHVagR-azp4W6NtAAASABGFW1epz46YAVVBdHMal0wdsBbMNFzfM3k0xawb8g2kps5bVFW9bxqmrQZrm6kAYAPQAfi0sABSIDtdA0CQynZLxiyRDACkSVVvCSeTSDCQQFCcLBS5iDAJtAIyTOaZJMhQUA9NUDAopcP2Up4B1M+0MCCjEkPppUSgNCISBFC0KgHQm4IRWde8u-ZCa2x4YRoFMP5wA0SKuu+wq15IHixkV3qFwdfSFha1r2tUWb1lFv9RAA0sasGxJjZv4ew9HzTvzQMlcYkxlLMDUpQWeXBtojh2qjI64Ada03pvzBKmttZJF-OLA2JtQAyzljzKGp0z5ISdm2Y2gJeCTRHrNTSEl5pbT2odY6p0JZIIZvWVQoQ0Hwx1vrX0JsnYbC8FCfM0lQDuFUCsUQzFBBOFTg0eEV9BBqBCqAPh1hHguCAA) <!-- playground:kysely --> |
| [`@typesql/drizzle`](packages/drizzle) | ORM schema | `drizzle-orm` ≥ 0.45 | — |
| [`@typesql/prisma`](packages/prisma) | ORM schema | `@prisma/client` ≥ 7 | [open](https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZUB3AlgFwBagAoBOGAzgLYCGoAFAAJYywkCOANsNMeRQJQB0EHLFAM4LVgFpOpSqADmsAHaxCFLAHtC6YliYihoACIAhUBkW7CAMwoBjYQCNYrdWgBQIUOsWhYANxVIUAADaW55JRU1WGCAGnRsPFxhABM1CgcKElgAchIvNB9FCjI9OkpoHnjirAwAkUZ8uhSHPgAqHlAKRRSPMBTYGwBXViwSAQAlCjRQJFRkn0IhxXzcQnUhuTxIDa0iGQoAYVYMJSwBAAl1AK1k0EImEbG+Pr7Qd4VlVQ1bxrZQADeb3e7041wwAy0AF5QAAiURMNhSLiUWHAkEbLDQIZYEEw2F8PjAEiEWzAFrABHiPhjNGed4AXzcbgwZGgmlxCMBoEO6lY8QA4pFvrAUvEAHIjVgZVjCBmgKzrMhw+h-di2TSwWEAbhZbI53NsD2i8DY8S5+24UzQx1OFlA8sV6mVsNVYjYHBRFB1zM8JLJFKpbBpJHiWQiX2ivXMlhs9iMpiBAEhgG02gQvaAyOoBqwQgBVbKEYICNrANxJoZFkgALkBFaTELrQsjuhSAB5YTGACywgB8uqTSdglAwrDrvNYnb8FFJOFn-cHKbTGYOCtOrBSIWKpRLoDLDZSpGg0sgAH0d7A65LWNKHLLO7oAB5YRcN9ay5vCqOdiZ8rUDg2qbpsEtBDNAaRtgAglgwR1tkuIOEElqyLaZzVOooCQRkWSpIMFBPKW5ZDuBkGijBE58o+rJMFgJTQG+SYMoOwGruE2a5iE+DqCQsFERW7K8bW9ZDk2PJUbCQxDBCjHLumKFUFYG5bsEBG4JoACSKR7geQ5qTgmhnmJk6dj2sm1Fgn7iVO8KwC+sl+KcaDCS2URtqZFgAByMcxFYACRUnWyZJn+VmwlBhgALIaeKsKgAAPnC+bwAAohMPpMbqTJuAMtjSg8oAaisuJhJQdYKdaaEWNqoCeDsQx7F6VVYG4RW8aA4igDCRqwCabDtiYfbUKVvA1Z4SwrF4Ph+cwQyBNa+YrBQViwGGrBoBQkD5JguCgA45hbtAs4lLAlgkMybW4hQKRkOY+QwtMFDYB1bDUBWwSpcgKWHOAZhilhx6nheJ3xJJEFRjBcUAGITAA8pFoBVio+QAOoXGlKX3P+XWgH5ACMcQVuFUUxbCsRuPwdmwLYOKwNQPC6vS7wAHoAPy+mAf7OV0BUIlu4YzXNhCQNa9ynQ1k3JGQdYxp5Zj5PtcgxtUQylMQtjy0Y1OshQrAvJdHV0WMOOPc94hvUmH0pV9P1dDiBmEEZ-0assWDUB0oBQfAoCCWM8QkKr1CObAzmdF7oDB9zMPwz7PHGwKcP5vgoDGAAmnb6mOxChOU0+1O0-TjNgCCbMXd47W5qdoomxtZvBlgqhLbYtTeNQ1BYE+nRQn2FYd9QwSGNbKXgJj0cI77qPoxMmP6YZEI4-jcSgHjuf57ovKu-T5MM+ioCl28E98PPpCgLQAzDKM1BSRC9M8OVmbNeut75M95jxNxvFyA8+QpOoeiKOoc4bhzbBBiqlCYv0YrgFhrHISNBZ5Z3+hZWUnQABqUFkD5hSt7ag+N4h+QAEw8CXnjUGFxnAuFhAzWqYAVDrEIDLLc858gAKwukTI2QsL4SeG4IAA) <!-- playground:prisma --> |

Two more workspace packages are private and not published: `@typesql/docs` (the VitePress
documentation site) and `@typesql/bench` (compile-time budget and runtime benchmarks).

## What is inferred

| Feature | Status |
|---|---|
| SELECT: joins (nullability per join kind, USING/NATURAL), aliases, `*`/`t.*`, WHERE, GROUP BY/HAVING, ORDER BY, LIMIT/OFFSET/FETCH, DISTINCT [ON], FOR UPDATE | ✓ |
| Subqueries (scalar, EXISTS, IN, ANY/ALL), derived tables, LATERAL, CTEs incl. RECURSIVE (with SEARCH/CYCLE), UNION/INTERSECT/EXCEPT, VALUES, set-returning functions and ROWS FROM in FROM, TABLESAMPLE | ✓ |
| Expressions: operators with numeric/date/JSON/array rules, casts and typed literals (`timestamp with time zone '…'`), CASE, COALESCE/NULLIF/GREATEST/LEAST, IS [NORMALIZED], BETWEEN, IN, LIKE, `op ANY/ALL`, OVERLAPS, AT TIME ZONE / AT LOCAL, arrays, subscripts, EXTRACT and friends, named and VARIADIC arguments, window functions, SQL/XML (`XMLELEMENT`, `XMLSERIALIZE`, `XMLTABLE`, …) | ✓ |
| SQL/JSON: `JSON_OBJECT`, `JSON_ARRAY`, `JSON_OBJECTAGG`/`JSON_ARRAYAGG`, `JSON_VALUE`/`JSON_QUERY`/`JSON_EXISTS`, `IS JSON`, `JSON_TABLE` in FROM | ✓ |
| Function catalog (string, numeric, date/time, JSON, arrays, aggregates, window) with Postgres nullability; every other `pg_catalog` function known by return type; unknown functions are errors; app functions declared in `$functions` or via `FunctionCatalog` augmentation | ✓ |
| Parameters: `$n` typed from context (`WHERE id = $1` → `number`), `:name` sugar, inline `${sql.param(value)}` with value type checks | ✓ |
| Nullability narrowing: `WHERE c IS NOT NULL` / comparisons / inner-join conditions make `c` non-null | ✓ |
| Errors with token positions and "Perhaps you meant …" hints for unknown columns, relations and functions | ✓ |
| INSERT/UPDATE/DELETE/MERGE with RETURNING (incl. `old` / `new`), required-column checks, ON CONFLICT, `EXCLUDED`, array / field assignment targets | ✓ |
| Cursors: `DECLARE … CURSOR FOR query` is checked and its parameters typed; `FETCH` / `MOVE` / `CLOSE` parse (no row type: the query is another statement) | ✓ |
| Write helpers: `sql.valueOrDefault(x)` (`DEFAULT` for `undefined`), typed `sql.set(table, partial)` and `sql.values(table, rows)` | ✓ |
| DDL → schema: `ApplyDdl<DB, "ALTER TABLE …">`, `migrations()` builder, views, enums, schemas | ✓ |
| Fragments: `{slot}` splicing with `$n` renumbering, `sql.fragment`, `sql.id`, `sql.join`, `sql.list` (runtime arrays of typed elements), `sql.raw`; dynamic text falls back to `sql.as<Row>()` | ✓ |
| Postgres output column naming (`?column?`, `count`, `case`, `btrim`, casts → type name, last duplicate wins) | ✓ |

Unsupported syntax is a compile error with a Postgres-style message and a token position,
never a silent `any`.

## Tested against PostgreSQL's own test suite

The parser is checked against the regression tests PostgreSQL runs on itself
(`src/test/regress` of PostgreSQL 18.6, vendored as a submodule in `vendor/postgres` and never
edited): about 50,000 statements, from everyday queries to `MERGE`, SQL/JSON, `TABLESAMPLE`,
recursive CTEs with `SEARCH` / `CYCLE` and hundreds of deliberate syntax errors. For each one, the
expected output that ships with the tests says what Postgres did, and TypeSQL must do the same:
parse what Postgres parses, reject what it rejects.

| Statements | Agree with Postgres | Disagree | Not checkable statically |
|---|---|---|---|
| 50,235 | 49,999 | 0 | 236 (psql variables with unknown values, `standard_conforming_strings = off`) |

CI runs the whole suite on every change and fails on a single disagreement
(`pnpm pg-regress:setup && pnpm test:pg-regress`). What the comparison covers and what it does not
is in [Postgres compatibility](packages/docs/guide/postgres-compatibility.md).

## SQLite and MySQL

TypeSQL supports only PostgreSQL today. SQLite and MySQL support is planned: you will write
queries in each database's own dialect and get row and parameter types the same way, with no
codegen and no database connection. Each dialect brings its own grammar, column type names,
function catalog and nullability rules, so it gets its own parser rules and type map, along with
drivers for that database.

## Schema

Columns are declared with **Postgres type names** so expression typing can follow Postgres
rules; the adapter's type map converts to TS types at the boundary (`int8` is a `string`
under `pg`, a `bigint` under postgres.js with bigint parsing).

```ts
interface DB {
  users: { id: Generated<"int4">; email: Col<"text">; mood: Enum<"mood"> };
  user_stats: View<{ user_id: Col<"int4">; n: Col<"int8"> }>;
  auth: { sessions: { token: Col<"uuid"> } };    // nested schema: auth.sessions
  $types: { mood: "happy" | "sad" };              // enum registry
}
```

System catalogs (`pg_stat_activity`, `pg_tables`, `information_schema.columns`, …) are an
opt-in slice: `createSql<DB & PgCatalog>()`.

Generate it from a live database with `typesql introspect` (from `@typesql/pg`):

```sh
pnpm exec typesql introspect --url postgres://localhost/app --out src/db/schema.ts
```

Or derive the schema from migrations:

```ts
const m = migrations()
  .add("CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL)")
  .add("ALTER TABLE users ADD COLUMN display_name text");
type DB = SchemaOf<typeof m>;
```

## Performance

The SQL is parsed by the type checker, so the cost is paid at compile time, in your editor and
in `tsc`. At runtime nothing is parsed: `sql(…)` builds `{ text, values }` and the driver runs it.

### Compile time

`packages/bench` type-checks generated files of distinct, realistic queries (joins, aggregates,
parameters) with `tsc --extendedDiagnostics`, on a 4-core Xeon Platinum 8488C with TypeScript
7.1.0-beta. Compiled against the built package with `skipLibCheck`, as an application is:

| File | Instantiations | Check time | With the [type cache](packages/docs/guide/caching.md) |
|---|---|---|---|
| 1 query | 18K | 0.04 s | |
| 50 queries | 517K | 0.31 s | 20K, 0.02 s |
| 500 queries | 4.6M | 2.6 s | 123K, 0.13 s |

Each additional query costs about 9.2K instantiations, or about 5 ms of check time (about 190
queries per second). TypeScript keeps a result only for the life of one program, so the editor
computes it again after every edit and `tsc` on every run. The optional type cache keeps the
results in a file the checker reads instead: a cached query costs about 230 instantiations, and an
entry is used only while everything it was computed from is unchanged.

Against TypeSQL's own sources, which `skipLibCheck` does not skip, the bench also covers the other
call forms and long statements:

| File | Instantiations | Check time |
|---|---|---|
| 1 query (mostly checking TypeSQL's sources) | 149K | 0.22 s |
| 500 queries | 4.7M | 2.8 s |
| 50 queries with `:name` and inline parameters and a shared fragment | 422K | 0.43 s |
| one statement each of 0.5, 1, 2, 4 and 8 KB | 6.6M | 0.95 s |

TypeSQL is built for the native compiler and its recursion budgets. CI fails a change that takes
a bench file over its instantiation or check-time budget, or a cache hit over 250 instantiations
(`packages/bench/thresholds.json`).

### Runtime

Building a query (Node 26, same machine; `pnpm build && node packages/bench/runtime.ts`):

| Call | Time |
|---|---|
| `sql("… WHERE id = $1", 7)` | 1.1 µs |
| `:name` parameters | 1.3 µs |
| inline `${sql.param(…)}` values | 4.0 µs |
| a `{slot}` fragment | 1.6 µs |

The text goes to the driver as written, and `execute*` returns the driver's rows unchanged (or
with top-level keys renamed, with `rowKeys: "camelCase"`). `@typesql/core` has no dependencies
and is 10 KB minified, 4.0 KB gzipped.

To reproduce the compile-time numbers: `node packages/bench/gen.ts && pnpm --filter @typesql/core build && node packages/bench/run.ts`.

## Toolchain and limits

Requires TypeScript ≥ 7.1 (the native compiler; `7.1.0-beta` works) and Node ≥ 26.

Known ceilings: statements up to 4096 tokens; left-nested `||` or `+` chains of ~100 terms
(`AND`/`OR` chains are balanced by the parser and are fine at 200+ terms). Past a ceiling,
use `sql.as<Row>()`.

Hovers show row keys in alphabetical order: TypeScript 7 orders the keys of computed object
types. The runtime row objects keep the SELECT order.

The documentation site lives in `packages/docs` (VitePress): run `pnpm docs:dev` to browse it
locally. Its pages pull their code examples from type-checked files, so they read best on the
site; the Markdown sources are the [guide](packages/docs/guide/getting-started.md),
the [API reference](packages/docs/reference/api.md), [DDL support](packages/docs/reference/ddl.md),
[Postgres compatibility](packages/docs/guide/postgres-compatibility.md),
[adapters](packages/docs/adapters/index.md), [editor completions](packages/docs/guide/editor.md)
and the [type engine](packages/docs/internals/engine.md).

## Development

```sh
pnpm install
pnpm typecheck         # tsc per package
pnpm test              # vitest: runtime + type tests; conformance runs against docker postgres:18 when available
pnpm build && pnpm smoke:dist   # import the built packages with plain Node
pnpm pg-regress:setup && pnpm test:pg-regress   # the parser against PostgreSQL 18's regression tests
pnpm docs:dev                   # the documentation site (packages/docs)
node packages/bench/gen.ts && node packages/bench/run.ts   # compile-time budget (thresholds.json)
node packages/bench/runtime.ts                               # cost of building a query, after pnpm build
pnpm playground                 # regenerate the TypeScript Playground links (--check: CI's check)
TYPESQL_PG_URL=… node scripts/catalog-from-pg.ts              # review the function catalog against pg_proc
pnpm change                     # record a change intent with any change to a published package
pnpm check:intents              # fail if a published package changed without one (CI runs it too)
```

Versions and changelogs use pnpm's built-in release management (`pnpm change`,
`pnpm version -r`, `pnpm publish -r`); [Releasing](packages/docs/internals/releasing.md) has the
workflow.
