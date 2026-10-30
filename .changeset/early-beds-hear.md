---
"@typesql/pg": patch
"@typesql/cli": patch
---

Improve typesql CLI errors: show the causes of a refused localhost connection instead of an empty message, reject a malformed --url, add --version, show introspect options for typesql introspect --help, resolve a config file's out against the config file, reject config files with unknown options or no default export, and silence the stripTypeScriptTypes experimental warning.
