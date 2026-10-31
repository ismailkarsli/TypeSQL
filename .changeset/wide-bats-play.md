---
"@typesql/core": patch
---

Copy a `$` that is not followed by digits, as in the regex `'[0-9]+$'` or a `$body$` dollar quote, through unchanged when a fragment is spliced into a query, and leave `$n` inside strings, quoted identifiers, comments and dollar quotes alone when counting and renumbering parameters, instead of failing with TS2589 or an "unterminated quoted string" error.
