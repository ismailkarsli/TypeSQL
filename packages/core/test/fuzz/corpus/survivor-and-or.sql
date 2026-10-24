-- Section 0 survivor: AND binds tighter than OR. `t1.c` is NULL in the row with id 0, which this
-- WHERE keeps; with the binding powers swapped, `t1.c IS NOT NULL` would narrow it.
SELECT t1.c FROM t1 WHERE t1.id = 0 OR true AND t1.c IS NOT NULL
