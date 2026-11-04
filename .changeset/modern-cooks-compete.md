---
"@typesql/core": patch
---

With `"skipLibCheck": false`, TypeSQL's own declarations type-check again in about a second, as before 5.0.4. Since 5.0.4 they took about 30 seconds and reported "Excessive complexity comparing types" (TS2859) errors in TypeSQL's files: a few with the default four checkers, and thousands, on the application's schema and queries too, with one checker (`--singleThreaded` or WebAssembly builds such as the tsrs playground).
