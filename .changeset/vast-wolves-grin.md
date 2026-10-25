---
"@typesql/core": patch
---

Operator results follow PostgreSQL in more cases: `0x…` / `0o…` / `0b…` literals and literals with leading zeros are typed by value (`0x1E` is int4, not numeric), bit-string `& | # ~ << >>` give `bit`, `int4[] || int8` is `int8[]`, `tsvector || text` is `text`, `money / $1` is float8, a `time` operand works as an interval (`ts - clock` is timestamp), `coalesce(varchar_col, name_col)` is `name`, and combinations PostgreSQL rejects (`ratio % 2`, `int4range + int4multirange`, `jsonb - int8`, `int4 || int4`) are `unknown` instead of a made-up type.
