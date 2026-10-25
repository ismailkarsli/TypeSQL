# @typesql/language-server

TypeScript 7's language server with completions for tables and columns inside
[TypeSQL](https://typesql.karsli.net)'s `sql()` strings, for editors without a TypeScript
extension API: [Neovim](https://typesql.karsli.net/guide/neovim),
[Zed](https://typesql.karsli.net/guide/zed) and others.

```ts
sql("SELECT * FROM |");          // users, posts, auth, …
sql("SELECT u.| FROM users u");  // id: int4, email: text, display_name: text | null
```

```sh
npm install -g @typesql/language-server
typesql-language-server [root]
```

It speaks LSP on stdin and stdout, and starts the project's `typescript` (7.1 or later) as
`tsc --lsp --stdio`. The project is `root`, or the workspace of the editor's `initialize`
request. Every message passes through. Inside a `sql()` string, completion responses get the
tables and columns of the `DB` type of the `sql` you call, read through an API session on that
same server, and lose TypeScript's item that would replace the whole statement.

Use it in place of your editor's TypeScript server. The project needs `@typesql/core` 0.4.0 or
later, directly or through an adapter.
