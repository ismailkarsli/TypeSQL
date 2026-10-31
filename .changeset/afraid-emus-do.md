---
"@typesql/core": patch
---

Parse a parenthesized subquery used as an operand inside parentheses, as in `((SELECT 1) - 1)`, and reject `first_value`, `last_value`, `nth_value`, `lag`, `lead` and `any_value` of an untyped literal or `NULL`, as PostgreSQL does.
