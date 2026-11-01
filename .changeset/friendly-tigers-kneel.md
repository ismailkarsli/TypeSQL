---
"@typesql/core": patch
---

Type array elements built from nullable values as nullable: `array_agg(body)` over a nullable column (with `ORDER BY`, `DISTINCT`, `FILTER` or `OVER` too) is now `(string | null)[]` instead of `string[]`, and so are `ARRAY[…]` and `ARRAY(SELECT …)` with a nullable item, `array_append`, `array_prepend`, `array_cat`, `array_replace`, `array_fill` and `||` with a nullable element, `string_to_array` with a null string, and `regexp_match` and `regexp_matches`, whose unmatched groups are `NULL`. Casts such as `array_agg(x)::varchar[]`, `coalesce`, `CASE`, `UNION`, subqueries and outer joins keep the nullable elements, `unnest` of such an array is nullable, and `array_agg(x) FILTER (WHERE x IS NOT NULL)` keeps non-null elements.
