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
      link: https://www.typescriptlang.org/play/#code/JYWwDg9gTgLgBAbwFAEgYE8wFM4GEIA2ANKgMZRYCGMWAygI7GobZwDiWAdllNVgCYk0mHADkArgQKUARgSxCWOAAqVeIAM4AVEYpFwAShADuO7CQC+cAGZQIIOACIAAko2MA9KWhZHAbiQkYE4aKGtKUhwAEQAhRFRxDR4NAC54lBRgfjSObl4afgAeR2CYABZHAD4AjKwQSmACNPwCYpoADxgqmpR+YA0waXQAfU5KECw0iSlZeTasTu7UFHIqAuHqHK4ePiLHGFAsDRhxsBgALyWUCxrIY9T0zOz2bfyBYtKADiuUSnEYAAW0GGWWahA+IQq1WWBxg8jBrX2Cy60IyMgg-HQU0k0jkWHmi1RNyQFkC3k4xzg7gIcAAvHBVnwGK1YpUABQASgCSHJlPodKpjDZqAABrQAKIAGXFuC0cHEADoskR5Qq6g1iHAwArYfIkHADYajcaAGIGADyAFl5UkoBp5XBpSa5QApc0ASVEWog9y1cHNXu1f0BwKyAsVWX1xujhoA6gAJcUGcWqsP0gAkAEYRUIAOwkLlIJSGEwCoymESFJQQaxwejQ4uqdT2+lN8baSvV2v17m8+DHagtwUEYUoMVSmVy4NAqAgwQMiDiEJsgBUHJV9XabN1WA5cAAgrQ4NIaJSzVbvb62BaAKrKOAxACacGnof4OaQheLtBOMCH5bMfEuypX8NGhHkIApeB1UaAVHEofhKGcBZTnkBVvBAfwIKghkKF2AVqVHEVPQlAw5U9LRzRtZI4DZGCCD3AA1fdJRvcUjzZdMEGpBUwDUcY6PqRoOQsPdky0G8DFET02DgZVcLWAQNhgD8v30XA8IKMsTEAqsRBrBTdnAwjx2lWU4E4CY4HPa1EmSEVCxMkik3I0RKMvP9aJ3JiWLYjisw5HMnHjLApAgRxCyAA
      playground: core
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
    details: "VS Code and Neovim complete tables and columns and highlight the SQL inside your strings."
    link: /guide/vscode
    linkText: "Set it up"
---

```ts
import { Pool } from "pg";
import { createSql } from "@typesql/pg";
import type { DB } from "./schema.js";

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
const sql = createSql<DB>(pool);

const recent = sql(
	`SELECT u.id, u.email, p.title
   FROM users u
   LEFT JOIN posts p ON p.author_id = u.id
   WHERE u.created_at > $1`,
	new Date("2026-01-01"),
);

const rows = await recent.execute();
```