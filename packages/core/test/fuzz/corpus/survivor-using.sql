-- Section 0 survivor: narrowing the merged USING column narrows it, not the right side's hidden
-- column. `t5.a` is NULL in every row of t3 without a partner.
SELECT t5.a FROM t3 LEFT JOIN t5 USING (a) WHERE a IS NOT NULL
