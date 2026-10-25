# @typesql/language-server

Completions for tables and columns inside [TypeSQL](https://typesql.karsli.net)'s `sql()`
strings, through an API session on TypeScript 7's language server (`tsc --lsp --stdio`), for
[Neovim](https://typesql.karsli.net/guide/neovim) and the [VS Code extension](https://typesql.karsli.net/guide/vscode).

```ts
sql("SELECT * FROM |");          // users, posts, auth, …
sql("SELECT u.| FROM users u");  // id: int4, email: text, display_name: text | null
```

```sh
npm install -g @typesql/language-server
typesql-language-server <pipe>
```

`typesql-language-server <pipe>` speaks JSON-RPC on stdin and stdout, connected to the running
TypeScript 7.1 language server whose `custom/initializeAPISession` returned `pipe` (no second
TypeScript process). Inside a `sql()` string, completion responses get the tables and columns of
the `DB` type of the `sql` you call, and lose TypeScript's item that would replace the whole
statement.

See the [Neovim guide](https://typesql.karsli.net/guide/neovim) for the `vim.lsp` hook. The
project needs `@typesql/core` 0.4.0 or later, directly or through an adapter, and `typescript`
7.1 or later.
