---
"@typesql/core": major
---

Breaking: `CasePlugin` and `CasePluginTypes` move from `@typesql/core` to the new `@typesql/core/plugins` entry, so applications that don't rename keys don't ship the plugin: `@typesql/core` is about 3.4 kB minified and gzipped. Change the import to `import { CasePlugin } from "@typesql/core/plugins"`; `.withPlugin(new CasePlugin())`, the renamed keys and their types are unchanged, and the custom-plugin types `SqlPlugin`, `PluginTypes`, `IdentityPluginTypes` and `InputContext` stay in `@typesql/core`.
