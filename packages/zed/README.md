# TypeSQL for Zed

Completions inside [TypeSQL](https://typesql.karsli.net)'s `sql()` strings: tables, views and
schemas after `FROM` / `JOIN` / `INTO` / `UPDATE`, columns after `alias.` and in expressions,
with their Postgres types.

```ts
sql("SELECT * FROM |");          // users, posts, auth, …
sql("SELECT u.| FROM users u");  // id: int4, email: text, display_name: text | null
```

The extension runs [`@typesql/language-server`](../language-server), TypeScript 7's language
server with these completions added, in place of Zed's TypeScript server. It needs `typescript`
7.1 or later and `@typesql/core` in the project. Enable it in `.zed/settings.json`:

```jsonc
{
  "languages": {
    "TypeScript": { "language_servers": ["typesql", "!typescript-ls", "!vtsls", "!typescript-language-server", "..."] },
    "TSX": { "language_servers": ["typesql", "!typescript-ls", "!vtsls", "!typescript-language-server", "..."] }
  }
}
```

For SQL highlighting, install Zed's **SQL** extension and put `/* sql */` before the string:
`sql(/* sql */ "SELECT …")`.

See the [Zed guide](https://typesql.karsli.net/guide/zed) for the type cache, settings and
troubleshooting.
