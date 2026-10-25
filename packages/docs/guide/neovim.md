# Neovim

`@typesql/language-server` completes table and column names inside your SQL strings in Neovim, like the [VS Code extension](./vscode).

```ts
sql("SELECT * FROM |");          // users, posts, active_users, auth, …
sql("SELECT u.| FROM users u");  // id: int4, email: text, display_name: text | null
```

It is TypeScript 7's language server with TypeSQL's completions added. It replaces `ts_ls`, `vtsls` or `tsgo`, so there is still one TypeScript process. Errors, hovers and row types come from TypeScript as before.

## Setup

1. Install the server:

   ```sh
   npm install -g @typesql/language-server
   ```

2. Have `@typesql/core` 0.4.0 or later in the project, directly or through an adapter, and `typescript` 7.1 or later (`npm install -D typescript@7.1.0-beta`). The server starts the project's `typescript`.

3. With Neovim 0.11 or later, add `~/.config/nvim/lsp/typesql.lua`:

   ```lua
   return {
     cmd = { "typesql-language-server" },
     filetypes = { "javascript", "javascriptreact", "typescript", "typescriptreact" },
     root_markers = { "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", ".git" },
   }
   ```

   and enable it in `init.lua`, instead of your TypeScript server:

   ```lua
   vim.lsp.enable("typesql")
   ```

The server starts TypeScript in the workspace Neovim sends it, the directory with the first of `root_markers`.

To use the [type cache](./performance#type-cache), allow the content mapper with `init_options = { runExternalCode = true }` in the same table.

## Syntax highlighting

[nvim-treesitter](https://github.com/nvim-treesitter/nvim-treesitter) already highlights SQL in `` sql(`…`) `` template literals once the `sql` parser is installed (`:TSInstall sql`). To also highlight `sql("…")`, `tx(…)`, `sql.fragment(…)` and `sql.as<Row>(…)`, save this as `~/.config/nvim/queries/typescript/injections.scm`, and as the same file under `queries/tsx/` and `queries/javascript/`:

```scheme
; extends

; TypeSQL: the first argument of sql("…") and tx("…") (also as a method, db.sql("…")), and of
; sql.fragment(…) and sql.as<Row>(…) (also on tx). nvim-treesitter injects sql(`…`) itself.
(call_expression
  function: [
    (identifier) @_fn
    (member_expression
      property: (property_identifier) @_fn)
  ]
  arguments: (arguments
    .
    (string
      (string_fragment) @injection.content))
  (#any-of? @_fn "sql" "tx")
  (#set! injection.language "sql"))

(call_expression
  function: [
    (identifier) @_fn
    (member_expression
      property: (property_identifier) @_fn)
  ]
  arguments: (arguments
    .
    (template_string) @injection.content)
  (#eq? @_fn "tx")
  (#offset! @injection.content 0 1 0 -1)
  (#set! injection.include-children)
  (#set! injection.language "sql"))

(call_expression
  function: (member_expression
    object: (identifier) @_object
    property: (property_identifier) @_fn)
  arguments: (arguments
    .
    (string
      (string_fragment) @injection.content))
  (#any-of? @_object "sql" "tx")
  (#any-of? @_fn "fragment" "as")
  (#set! injection.language "sql"))

(call_expression
  function: (member_expression
    object: (identifier) @_object
    property: (property_identifier) @_fn)
  arguments: (arguments
    .
    (template_string) @injection.content)
  (#any-of? @_object "sql" "tx")
  (#any-of? @_fn "fragment" "as")
  (#offset! @injection.content 0 1 0 -1)
  (#set! injection.include-children)
  (#set! injection.language "sql"))
```

`; extends` adds these rules to nvim-treesitter's instead of replacing them.

## How it works

The server is a proxy in front of `tsc --lsp --stdio`. It passes every message through. When TypeScript answers a completion request inside a `sql()` string, the server opens an API session on that same TypeScript server, adds the tables and columns, and drops TypeScript's item that would replace the whole statement. A lookup that fails or takes longer than 150 ms adds nothing.

## Troubleshooting

- `:checkhealth vim.lsp` shows whether `typesql` is attached and where the LSP log is. The server writes to that log which `@typesql/core` it uses, slow requests and errors.
- "cannot start TypeScript's language server" means there is no `typescript` in the workspace.
- After installing or upgrading `@typesql/core` or `typescript`, restart Neovim (or `:LspRestart` with nvim-lspconfig).
