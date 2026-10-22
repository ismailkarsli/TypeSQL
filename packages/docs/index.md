---
layout: home

hero:
  name: "TypeSQL"
  text: "Type-level Postgres SQL for TypeScript"
  tagline: "Write SQL as a string literal. The compiler parses it and gives you the row type, the parameter types and the schema changes. No codegen, no database connection, no build step."
  actions:
    - theme: brand
      text: "Get started"
      link: /guide/getting-started
    - theme: alt
      text: "Try it in the Playground"
      link: https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZAXKACgewM4BcBzAJ1h1CWQBpRoBDInWAE1ACNIIYEBjIgS2h4A5GTxdQOSPlgBbAHSgAokz55QeABaxyKULQB2LDVgBusIuq3quOVACgQoIlgDuZAyzpFaM2HnNkAGZYADYhrtQeoDJ8+LQA1qR6JKDcWDLQfCHa5s4MoFj6ltr4-PoEcnZ8GVhEagDeqSS0-vAAjiHUYnCgAMKhXeIA4rD65i3Mgz0AcgCuYbSs2VPaGPQ+OFBwK6AASq5b2gC+oIHOMqAARAAC3aQdwGkklwDcdlX6-kSBtNzaACIAIVA9TsoFAs0YDHQoPB4L4THQIzG3n8TAAPJc+J8ACyXAB8L1Ajg0tHcoCYsB+8zw6Cwgj4hVoIQKRQAktN4IpduAwXDZLQsuh+iFMf4AB54AlvOEU2LQEK0SAAfX0Plg6DmCyWsDFsEl0r54N4sAmTGVLSRo3GaLF1VIeB8ggAXobwUcZTRcHhbCCjaAEVaUWbMdi8AAON1w2izTS1ZWBvqhUO4qPgvCqbLC5OXCVSwn+1hYJiQTXzRU6vUGgvut5Hd5pfT4CQdUAAXiaptaHXRQPxAAoAJRvBxgZCKABi4FAACkAPIc6IJJKabT8AgaNQ4BHafTlxbZIkAEgAjOpl2RVKJxGd0hC5AjKo3m212y2Qv2AAZc8e9aezB8mGoACBSyahoDkDM8Gyf1ZTg8EJ12OcAFkIShMhZlAccp1nBdpi9fAyGgUA53wiCYzjIgExYDsAIRWD4NlAB1AAJblFHvBE31PT9qAAdmHOw7j2Vw332FxDnRO4sECUA2gLRxwQAPQAfiE8Q1m8GQyA7TSNkk6TZPkt5FNAVT3kcABBAhiFgAgJncQxUlCWYZCKNVfCCUJwhcTBvVs300lmT5+wAKkHANL0+cNIgkPAygICFDHMUB9GLWAAFpoH8kgcCfQpmziH03xwDovx-RQ-z0WNjCohFqCCkLwuoGRaHFfsoOyCLLPgUBFX8ZtEJQgjiqGJCAFUMFAQEAE1qso6jP0E4T4EdYqO3EgyuBkuKWhwBSwGUtTR1ANl9BCbFtBMZlZiSegSlGNQyVAI8ii8dUvkclhuC0bhEhYWh7OxZsXC0FJVw4e60OYfKmzUUCWQ7S5aCYWhrn1J1sjkNIZFeOxnzUE0zRKsrPw5LkeVO6ZwDnaH8n7BGIoANUs5BxsUXr+yPepSpCOR3pkBnWqyQcjgi3ZFHAcbdmmDkhgDIDOzNC08CWt5hN6Zo0TEg4uCk7bZKJtEDrhcyTuQ2JHUSdwUhxzJslAXJajIQpih0ZA4oShQJz4cVihkexefKxRf2nfRfFAIbUMhAI1eJMAnaIdA0hCVyikucPYEuCksCSNL4fFS27CDsnOW5acORpkayA6zNYGZ1n2c509B14q4WNgMIsEuYd48dog8nQCjauoyLQGmOdp2mcbkA9qJSTINKKSpGMQjwOwgA # playground:core
    - theme: alt
      text: "API reference"
      link: /reference/api

features:
  - title: "Exact row types"
    details: "Column names follow Postgres's own naming rules, and nullability follows its semantics, including outer joins, aggregates, COALESCE, scalar subqueries and WHERE clauses that rule out NULL."
  - title: "Typed parameters"
    details: "$1, :name or inline ${sql.param(value)}. Each parameter takes its type from where it is used, and values are checked against it. Interpolating a value into the SQL text is a compile error."
  - title: "Mistakes are compile errors"
    details: "Unknown columns, ambiguous references, missing NOT NULL columns or syntax errors show up on the SQL string, worded like Postgres errors, with \"Perhaps you meant\" hints."
  - title: "The whole statement language"
    details: "Joins, subqueries, CTEs, set operations, window functions, INSERT/UPDATE/DELETE with RETURNING, ON CONFLICT, and DDL that evolves the schema type."
  - title: "Thin runtime"
    details: "A query is { text, values }. Adapters for node-postgres and postgres.js run it, with type maps that match each driver's parsers."
  - title: "Built for TypeScript 7"
    details: "The engine is written to the native compiler's recursion budgets: 100 simple queries in a file check in under a second, and statements up to 8 KB infer."
---

<<< @/snippets/getting-started.ts#query
