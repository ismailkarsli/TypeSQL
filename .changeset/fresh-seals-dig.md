---
"@typesql/core": patch
---

Type as nullable a column that uses a cast parameter accepting `null`, such as `upper($1::text)` or `coalesce($1::date)`; the aggregates `stddev`, `stddev_samp`, `variance`, `var_samp`, `corr`, `covar_samp`, `regr_intercept`, `regr_r2` and `regr_slope`, which return `NULL` for a single row; `to_char` of a date, timestamp or interval; and `collation for` of an untyped literal or `NULL`.
