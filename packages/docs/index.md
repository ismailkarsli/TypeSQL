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
      link: https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZAXKACgewM4BcBzAJ1h1CWQBpRoBDInWAE1ACNIIYEBjIgS2h4A5GTxdQOSPlgBbAHSgAokz55QeABaxyKULQB2LDVgBusIuq3quOVACgQoIlgDuZAyzpFaM2HnNkAGZYADYhrtQeoDJ8+LQA1qR6JKDcWDLQfCHa5s4MoFj6ltr4-PoEcnZ8GVhEagDedgCQYnCgAMKhlM28sLT+8ACOId0t4gDisPrm-cyjrdoAcgCuYbSs2fPiGPQ+OFBwW20ASq4HsN0AvqCBzjKgAEQAAgs4w8BpJA8A3HZV+v4iIFaNxtAARABCoEaTWWjAY6BhTT4THQk2m3n8TAAPA8+ACACwPAB831Ajg0tHcoCYsGBqzw6Cwgj4hVoIQKRQAkot4IpjuBmk1ZLQsuhOiFcf4AB54Em-JpNFQ4aAhWiQAD6+h8sHQKzWG1gUtgsvlQt6syYGv6aKmMyxUuqpDwPkEAC8zU1LgroLg8LZoUKUbaMZbcfi8AAOT1NWjLTS1DXBjqhcOEmN4VTZcWph4yuWkoWsLBMSB61Zqw3G02Fr2-S5-NL6fASYagAC8qRIsyGkshxIAFABKX4OMDIRQAMXAoAAUgB5HnRBJJTTafgEDRqHAo7T6CvrbJkgAkAEZ1CuyKpROJbulQMs5CjKk2W4MO62QgPmgADPkT9oZ0fFFqEfEUsmoaA5EzPBsjsUAEMQpDkMnY55wAWQfeEyGWUAJ2nOdF0WGg-TIaBQHnYioLjBMiCTFhO2Aph4OQ1jEIAdQACX5RQHyfBjQDPH9RgAdm6Ec7AWUBThcD8ZPObEFiwQJQEGQtHAQgA9AB+STtl2GQyE7HZvEMhSlJUtTfg00AdL+RwAEECGIWACFmdxDFSUJlhkIptV8IJQnCWTsHwFyAzSZYAQHAAqIdQFiBKAUjSIJDwMoCAfQxzFAfQS1gABaX0wpIHAX0KFs4n9D83i-X9-0UQC9HjYw6JAryorwWKh2oGRaGlAcYOyeKHPgUA1X8FtUIwkj8DIcY0IAVQwUAIQATWa2j6OEuwJKk+AXWqzt5K4RSuGUtL+hwdSwC03Sx1ALl9BCfFtBMdlliSegSimNQqUEoovB1QEPJYbgtG4RIWFoNz8RbFwtBSNcOG+rDmHK5s1HAjlOweWgmFoJ4TVdbI5DSGQfjsV81AtLEauGb8mh-Hk+QFR7FnAec0fyAdsfigA1BzkEWxQxoHY96lquQgZkXm+qyIdLni45FHARbjkWHlxgSphqFp5hrTwHa9vEdpuzp46zlOiyuz6LEbsQuyHvQ2IXUSdwUnJzJslAXJajIQpih0ZA0oyhRJz4aVihkexaoHP9FAAmd9F8UBpswuEAh-EdyTAP2iHQNIQh8ooHhT2AHhpLAkjyrHpVduw4+Z3l+RnHlOdm6rBqzWABaFkWxbPIdhMeTjYDCLAHhzxx8-QGjWvohKyEWecZ0WRbkBDqJKTIPKaTpOMQjwOwgA # playground:core
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
  - title: "Agrees with Postgres's own test suite"
    details: "Every checkable statement of PostgreSQL 18's regression tests, almost 50,000 of them, parses exactly when Postgres parses it, and CI keeps it that way."
    link: /guide/postgres-compatibility
    linkText: "How it is tested"
  - title: "The whole statement language"
    details: "Joins, subqueries, CTEs with SEARCH/CYCLE, set operations, window functions, INSERT/UPDATE/DELETE/MERGE with RETURNING, ON CONFLICT, SQL/JSON and SQL/XML, and DDL that evolves the schema type."
  - title: "Thin runtime"
    details: "A query is { text, values }. Adapters for node-postgres and postgres.js run it, with type maps that match each driver's parsers."
  - title: "Built for TypeScript 7.1"
    details: "The engine is written to the native compiler's recursion budgets: 100 simple queries in a file check in under a second, and statements up to 8 KB infer."
---

<<< @/snippets/getting-started.ts#query
