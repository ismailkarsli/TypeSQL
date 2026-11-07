# Editor support

Errors, hovers and row types need no setup. Completions and highlighting need a language server on TypeScript 7.1+; 7.0 is the usual reason they're missing. Restart it after upgrading `@typesql/core` or `typescript`.

## VS Code (1.144+)

Install `typesql.typesql` and `TypeScriptTeam.native-preview` (Marketplace only; Open VSX editors get highlighting only). Add `typescript@7.1.0-beta` to the project, then in `.vscode/settings.json`:

```jsonc
{
  "js/ts.experimental.useTsgo": true,
  "js/ts.tsdk.path": "node_modules/typescript"
}
```

Debug with the **TypeSQL** and **TypeScript 7** output channels. Toggles: `typesql.completions.enable`, `typesql.semanticHighlighting.enable`. Details: <https://typesql.karsli.net/guide/vscode>.

## Neovim (0.11+)

`pnpm add -g @typesql/language-server`, with `typescript` 7.1+ in the project. Copy the `lsp/tsgo.lua` config and treesitter injections from <https://typesql.karsli.net/guide/neovim>; with nvim-lspconfig, use `after/lsp/tsgo.lua`. Debug with `:checkhealth vim.lsp`.
