---
layout: home

hero:
  name: "TypeSQL"
  text: "Typed Postgres SQL for TypeScript"
  tagline: "Write plain SQL and get exact types for rows and parameters. No codegen, no database connection, no build step."
  actions:
    - theme: brand
      text: "Get started"
      link: /guide/quick-start
    - theme: alt
      text: "Try it in the Playground"
      link: https://www.typescriptlang.org/play/#code/PTAEBUE8AcFMGUCKAZAXKACgewM4BcBzAJ1h1CWQBpRoBDInWAE1ACNIIYEBjIgS2h4A5GTxdQOSPlgBbAHSgAokz55QeABaxyKULQB2LDVgBusIuq3quOVACgQoIlgDuZAyzpFaM2HnNkAGZYADYhrtQeoDJ8+LQA1qR6JKDcWDLQfCHa5s4MoFj6ltr4-PoEcnZ8GVhEagDedgCQYnCgAMKhlM28sLT+8ACOId0t4gDisPrm-cyjrdoAcgCuYbSs2fPiGPQ+OFBwW20ASq4HsN0AvqCBzjKgAEQAAgs4w8BpJA8A3HZV+v4iIFaNxtAARABCoEaTWWjAY6BhTT4THQk2m3n8TAAPA8+ACACwPAB831Ajg0tHcoCYsGBqzw6Cwgj4hVoIQKRQAkot4IpjuBmk1ZLQsuhOiFcf4AB54Em-JpNFQ4aAhWiQAD6+h8sHQKzWG1gUtgsvlQt6syYGv6aKmMyxUuqpDwPkEAC8zU1LgroLg8LZoUKUbaMZbcfi8AAOT1NWjLTS1DXBjqhcOEmN4VTZcWph4yuWkoWsLBMSB61Zqw3G02Fr2-S5-NL6fASYagAC8qRIsyGkshxIAFABKX4OMDIRQAMXAoAAUgB5HnRBJJTTafgEDRqHAo7T6CvrbJkgAkAEZ1CuyKpROJbulQMs5CjKk2W4MO62QgPmgADPkT9oZ0fFFqEfEUsmoaA5EzPBsjsUAEMQpDkMnY55wAWQfeEyGWUAJ2nOdF0WGg-TIaBQHnYioLjBMiCTFhO2Aph4OQ1jEIAdQACX5RQHyfBjQDPH9RgAdm6Ec7AWUBThcD8ZPObEFiwQJQEGQtHAQgA9AB+STtl2GQyE7HZvEMhSlJUtTfg00AdL+RwAEECGIWACFmdxDFSUJlhkIptV8IJQnCWTsHwFyAzSZYAQHAAqIdQFiBKAUjSIJDwMoCAfQxzFAfQS1gABaX0wpIHAX0KFs4n9D83i-X9-0UQC9HjYw6JAryorwWKh2oGRaGlAcYOyeKHPgUA1X8FtUIwkj8DIcY0IAVQwUAIQATWa2j6OEuwJKk+AXWqzt5K4RSuGUtL+hwdSwC03Sx1ALl9BCfFtBMdlliSegSimNQqUEoovB1QEPJYbgtG4RIWFoNz8RbFwtBSNcOG+rDmHK5s1HAjlOweWgmFoJ4TVdbI5DSGQfjsV81AtLEauGb8mh-Hk+QFR7FnAec0fyAdsfigA1BzkEWxQxoHY96lquQgZkXm+qyIdLni45FHARbjkWHlxgSphqFp5hrTwHa9vEdpuzp46zlOiyuz6LEbsQuyHvQ2IXUSdwUnJzJslAXJajIQpih0ZA0oyhRJz4aVihkexaoHP9FAAmd9F8UBpswuEAh-EdyTAP2iHQNIQh8ooHhT2AHhpLAkjyrHpVduw4+Z3l+RnHlOdm6rBqzWABaFkWxbPIdhMeTjYDCLAHhzxx8-QGjWvohKyEWecZ0WRbkBDqJKTIPKaTpOMQjwOwgA # playground:core
    - theme: alt
      text: "View on GitHub"
      link: https://github.com/ismailkarsli/TypeSQL

features:
  - title: "Plain SQL, exact types"
    details: "Write the SQL Postgres runs. Row and parameter types follow Postgres's rules, including nullability from joins."
  - title: "No codegen"
    details: "The TypeScript compiler reads your SQL. There is no generate step and no database to connect to."
  - title: "Mistakes are compile errors"
    details: "A misspelled column, an unknown table or a wrong parameter is caught in your editor, worded like Postgres."
  - title: "Editor support"
    details: "The VS Code extension completes tables and columns and highlights the SQL inside your strings."
    link: /guide/editor
    linkText: "Set it up"
---

<<< @/snippets/getting-started.ts#query
