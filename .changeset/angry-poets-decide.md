---
"@typesql/core": minor
---

`$functions` keys can be schema-qualified: `"app.label": Sig<...>` is what `app.label(x)` calls, so functions of one name in two schemas can have their own signatures. A bare key still answers qualified calls. An unknown qualified call is reported with its qualified name, and an unqualified call to a function declared only under a schema suggests the qualified name.
