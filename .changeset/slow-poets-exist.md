---
"@typesql/cli": patch
---

`main(argv, io)` writes the output of `typesql introspect` through `io`, as it does for `typesql migrate`, instead of to the process's stdout and stderr.
