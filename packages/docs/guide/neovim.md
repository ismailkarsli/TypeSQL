# Neovim

`@typesql/language-server` completes table and column names inside your SQL strings in Neovim, like the [VS Code extension](./vscode).

```ts
sql("SELECT * FROM |");
sql("SELECT u.| FROM users u");
```

It hooks into TypeScript 7's language server (`tsc --lsp --stdio`) and reads its program through an API session, so there is no second TypeScript process. Errors, hovers and row types come from TypeScript as before.

## Setup

1. Install the server:

   ```sh
   npm install -g @typesql/language-server
   ```

2. Have `@typesql/core` 0.4.0 or later in the project, directly or through an adapter, and `typescript` 7.1 or later (`npm install -D typescript@7.1.0-beta`).

3. With Neovim 0.11 or later, add `~/.config/nvim/lsp/tsgo.lua`:

   ```lua
   return {
     cmd = { "npx", "tsc", "--lsp", "--stdio" },
     filetypes = { "javascript", "javascriptreact", "typescript", "typescriptreact" },
     root_markers = { "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", ".git" },
     capabilities = { general = { positionEncodings = { "utf-16" } } },
     on_init = function(client)
       client:request("custom/initializeAPISession", vim.empty_dict(), function(_, res)
         if not res or not res.pipe then return end
         local rpc = vim.lsp.rpc.start({ "typesql-language-server", res.pipe }, {})
         local request = client.request
         function client:request(method, params, handler, bufnr)
           if method == "completionItem/resolve" and not params.data then return true, 0 end
           if method ~= "textDocument/completion" then
             return request(self, method, params, handler, bufnr)
           end
           return request(self, method, params, function(err, result, ctx, config)
             local h = handler or self.handlers[method] or vim.lsp.handlers[method]
             local buf = bufnr or vim.uri_to_bufnr(params.textDocument.uri)
             if err or not vim.api.nvim_buf_is_loaded(buf) then
               return h(err, result, ctx, config)
             end
             local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
             rpc.request("textDocument/completion", {
               uri = params.textDocument.uri,
               position = params.position,
               text = table.concat(lines, "\n"),
               result = result,
             }, function(e, merged)
               h(nil, e and result or merged, ctx, config)
             end)
           end, bufnr)
         end
       end)
     end,
   }
   ```

   and enable it in `init.lua`:

   ```lua
   vim.lsp.enable("tsgo")
   ```

If you already configure `tsgo` with `nvim-lspconfig`, you can leave out `filetypes` and `root_markers`: Neovim merges `~/.config/nvim/lsp/tsgo.lua` into it.

## Syntax highlighting

[nvim-treesitter](https://github.com/nvim-treesitter/nvim-treesitter) already highlights SQL in `` sql(`…`) `` template literals once the `sql` parser is installed (`:TSInstall sql`). To also highlight `sql("…")`, `tx(…)`, `sql.fragment(…)` and `sql.as<Row>(…)`, save this as `~/.config/nvim/queries/typescript/injections.scm`, and as the same file under `queries/tsx/` and `queries/javascript/`:

```scheme

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

When TypeScript's language server starts, `on_init` opens an API session on it (`custom/initializeAPISession`) and passes the session's pipe to `typesql-language-server`. When TypeScript answers a completion request inside a `sql()` string, `typesql-language-server` reads the tables and columns from that same TypeScript server, adds them to the response, and drops TypeScript's item that would replace the whole statement. A lookup that fails or takes longer than 150 ms adds nothing.

## Troubleshooting

- `:checkhealth vim.lsp` shows whether `tsgo` is attached and where the LSP log is. `typesql-language-server` writes to that log which `@typesql/core` it uses, slow requests and errors.
- After installing or upgrading `@typesql/core` or `typescript`, restart Neovim (or `:LspRestart` with nvim-lspconfig).
