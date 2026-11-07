---
"@typesql/cli": minor
---

`typesql format` lays out the lines of the SQL: it goes on one line if it fits within 80 columns, and otherwise on a clause per line, with an item or condition per line in a clause that is still too long and the contents of parentheses that don't fit one level deeper. SQL that leaves one line goes into a template literal, and blank lines and an escaped `\n` between tokens are removed. `format: { width }` in the config or `--width <columns>` sets the width.
