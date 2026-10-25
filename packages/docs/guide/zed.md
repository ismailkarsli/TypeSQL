# Zed

The TypeSQL extension for Zed completes table and column names inside your SQL strings, like the [VS Code extension](./vscode).

```ts
sql("SELECT * FROM |");          // users, posts, active_users, auth, …
sql("SELECT u.| FROM users u");  // id: int4, email: text, display_name: text | null
```

It runs `@typesql/language-server`, which is TypeScript 7's language server with TypeSQL's completions added. It replaces the TypeScript server you use now, so there is still one TypeScript process. Errors, hovers and row types come from TypeScript as before.

## Setup

1. Install the **TypeSQL** extension from Zed's extensions page.
2. Have `@typesql/core` 0.4.0 or later in the project, directly or through an adapter, and `typescript` 7.1 or later in the project root (`npm install -D typescript@7.1.0-beta`). The server starts the project's `typescript`.
3. Use it instead of Zed's TypeScript servers in the project's `.zed/settings.json`:

```jsonc
{
  "languages": {
    "TypeScript": { "language_servers": ["typesql", "!typescript-ls", "!vtsls", "!typescript-language-server", "..."] },
    "TSX": { "language_servers": ["typesql", "!typescript-ls", "!vtsls", "!typescript-language-server", "..."] }
  }
}
```

Add the same for `JavaScript` and `JSX` if your queries are in `.js` files.

To use the [type cache](./performance#type-cache), allow the content mapper:

```jsonc
{
  "lsp": {
    "typesql": { "initialization_options": { "runExternalCode": true } }
  }
}
```

`lsp.typesql.initialization_options` and `lsp.typesql.settings` go to TypeScript's server as they are.

## Syntax highlighting

Zed highlights SQL after a `/* sql */` comment with its SQL extension. Install **SQL** from the extensions page and mark the strings:

```ts
sql(/* sql */ "SELECT id, email FROM users WHERE id = $1", 1);
sql(/* sql */ `
  SELECT u.id, p.title
  FROM users u JOIN posts p ON p.author_id = u.id
`);
```

Unlike the VS Code extension's highlighting, `$1`, `:name` and `{slot}` are not colored separately.

## How it works

The server is a proxy in front of `tsc --lsp --stdio`. It passes every message through. When TypeScript answers a completion request inside a `sql()` string, the server opens an API session on that same TypeScript server, adds the tables and columns, and drops TypeScript's item that would replace the whole statement. A lookup that fails or takes longer than 150 ms adds nothing.

## Troubleshooting

- The server logs to Zed's language server log (**dev: open language server logs**, server `typesql`), including which `@typesql/core` it uses and slow requests.
- "cannot start the language server" means there is no `typescript` in the project root.
- After installing or upgrading `@typesql/core` or `typescript`, restart the server (**editor: restart language server**).
- To run a local build of the server, point the extension at it:

```jsonc
{
  "lsp": {
    "typesql": { "binary": { "path": "node", "arguments": ["/path/to/packages/language-server/dist/bin.js"] } }
  }
}
```

The project root is passed as the last argument.
