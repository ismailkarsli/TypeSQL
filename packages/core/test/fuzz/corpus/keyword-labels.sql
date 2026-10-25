-- Keywords as bare column labels: every keyword but the 39 that pg_get_keywords() marks as no bare
-- label, reserved ones too; an operator keyword is the label when the token after it ends the target.
SELECT t1.a and, t1.c is, t1.e or, t2.b like, t1.c IS NULL in, t1.a + 1 between, t2.y AND t1.e collate, t1.id all, t1.j select FROM t1 LEFT JOIN t2 ON t2.t1_id = t1.id
