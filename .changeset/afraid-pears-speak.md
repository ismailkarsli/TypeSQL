---
"@typesql/cli": minor
---

`typesql migrate make` writes `up` and `down` with `migration()` from `@typesql/core/migration`, importing the previous migration's `up` as `./name.js`, so long migration histories type-check in the editor and with `tsc`.
