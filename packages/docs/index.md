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
