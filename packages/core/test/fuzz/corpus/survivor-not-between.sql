-- Section 0 survivor: NOT BETWEEN narrows its operand, never its bounds. 0 NOT BETWEEN 1 AND NULL
-- is TRUE, so rows with a NULL `t1.a` stay.
SELECT t1.a FROM t1 WHERE 0 NOT BETWEEN 1 AND t1.a
