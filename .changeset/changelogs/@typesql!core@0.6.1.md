## 0.6.1

### Patch Changes

- A recursive CTE whose recursive term takes more than three steps to carry a NULL into a column types every column nullable, instead of typing the columns the NULL had not reached yet non-null; a recursive CTE whose query has its own WITH clause is accepted (it was `relation "s" does not exist`).

- A `GROUPING SETS (…)` whose parenthesis is never closed is a syntax error, as in PostgreSQL (it was accepted).

- Assigning `DEFAULT` through an indirection (`SET a[1] = DEFAULT`, `INSERT INTO t (c.f) VALUES (DEFAULT)`, also in a multi-column SET and in MERGE) is rejected with PostgreSQL's `cannot set an array element to DEFAULT` / `cannot set a subfield to DEFAULT` (it was accepted, or `DEFAULT is not allowed in this context`).

- `EXTRACT` of a field an infinite timestamp, date or interval has no value of (`day`, `month`, `second`, …) is nullable: PostgreSQL returns NULL there (`year`, `epoch`, … are ±Infinity).

- The lexer reads numbers and whitespace as PostgreSQL does: a radix literal followed by more identifier characters is one junk token (`0o19`, `0b12`, `0xg` are `trailing junk after numeric literal`, `0x_` is `invalid hexadecimal integer at or near "0x_"`), and a statement with a run of 1000 or more whitespace characters is lexed instead of failing with "Type instantiation is excessively deep".

- `ARRAY[]` without a cast to an array type is an error, as in PostgreSQL (`cannot determine type of empty array`); `ARRAY[ARRAY[]]::int4[]` is typed by its cast.

- Named parameters are read the same way in the types as at runtime: a colon followed by a space (`JSON_OBJECT('a': v)`, `a[1: n]`) is no longer a parameter and no longer a syntax error, `:name` inside a dollar-quoted string is not one, and a `:name` that PostgreSQL reads inside a string or comment takes no value. `FromKysely` no longer registers an enum for a string-literal column overridden to a system type such as `xid` or `pg_lsn`.

- An ordered-set aggregate without WITHIN GROUP is an error, as in PostgreSQL (`function percentile_cont(numeric) does not exist`, `WITHIN GROUP is required for ordered-set aggregate rank`); it was accepted.

- OVERLAY checks and types all its operands: a nullable PLACING, FROM or FOR value makes the result nullable, an unknown column there is an error, and their `$n` are typed (text, integer); `substring($1 FOR $2)` types `$2` as an integer, as PostgreSQL does.

- Keywords are read as in PostgreSQL 18: every keyword but the 39 that `pg_get_keywords()` marks as no bare label is a column label without AS, reserved ones too (`SELECT 1 all`, `SELECT 1 and, 2`, `SELECT x like FROM t`); any keyword is a name after a dot (`t.from`, `public.select`); type/function-name keywords such as `left` or `is` name functions only, no tables, columns, aliases, CTEs or constraints; `exists` without a parenthesis is a column; column-name keywords like `between` are no type names; and `FOR` without a lock strength is a syntax error.

- SQL/JSON ON EMPTY / ON ERROR clauses are checked as in PostgreSQL: a behavior the function or JSON_TABLE column does not allow is an error (`invalid ON ERROR behavior`, `invalid ON EMPTY behavior for column "a"`), and so is a DEFAULT that is a bare parameter, column or subquery (`can only specify a constant, non-aggregate function, or operator expression for DEFAULT`).

- Of several missing windows in one expression the first is reported (`count(*) OVER w1 + count(*) OVER w2` was accepted).

- `x op ANY|ALL (SELECT …)` and `(a, b) op (SELECT …)` compare the operands pairwise, as in PostgreSQL: a row takes any operator, which must yield boolean (`1 + ANY (SELECT 1)` is `row comparison operator must yield type boolean, not type integer`; it was accepted), and a row of several columns needs a comparison operator.

- Expressions parse as PostgreSQL's grammar reads them: `a = b = c`, `a LIKE b LIKE c`, `a BETWEEN b AND c IN (…)` and `a IS DISTINCT FROM b IS NULL` are syntax errors; a subscript or field selection follows only a column, a parameter, a subquery or a parenthesized expression (`f(x)[1]`, `ARRAY[1][1]`, `ROW(1, 2).f1` are syntax errors, `(f(x))[1]` works); `x IN ((SELECT 1), 2)` is a list; and `a OPERATOR(pg_catalog.+) b` is typed as `a + b` and takes `ANY (…)`.

- DDL that PostgreSQL rejects as a syntax error is rejected too: a dangling dot after a name (`CREATE TYPE a.b.`), a table's clauses after its columns out of PostgreSQL's order or repeated (`INHERITS`, `PARTITION BY`, `USING`, `WITH`, `ON COMMIT`, `TABLESPACE`), `STORAGE` / `COMPRESSION` anywhere but right after a column's type, `INCLUDE` on a column's `PRIMARY KEY` / `UNIQUE`, a trailing comma among enum labels, an unterminated `BEGIN ATOMIC` body or options after its `END`, `ADD PRIMARY` without `KEY`, an index in `CREATE SCHEMA` without `ON table`; `NULL` with `PRIMARY KEY` on a column, `DEFERRABLE` or `[NOT] ENFORCED` on a `NOT NULL` table constraint and `WITH CHECK OPTION` on a recursive view are PostgreSQL's errors, and a bad `LIKE` option is an error instead of `never`.

- An error located at a keyword (`DEFAULT is not allowed in this context`, `ORDER BY position … is not in select list`, `each UNION query …`, `UNION types … cannot be matched`, `SELECT ... INTO is not allowed here`) points at the keyword, not at an earlier quoted identifier spelled like it (`AS "union"`).

- Interval literals take only PostgreSQL's fields after the string (`interval '1' year to day`, `interval day '1'` and `interval(2) '1' day` are syntax errors), a keyword type with array bounds is no typed literal (`numeric[] '{1}'`), `substring(e FOR n FROM m)` is accepted and `substring(e FROM a FROM b)` rejected, and window frames are checked as in PostgreSQL (`frame start cannot be UNBOUNDED FOLLOWING`, `GROUPS mode requires an ORDER BY clause`, …).

- A DDL statement with an unclosed parenthesis (in a routine's parameters or RETURNS TABLE, a column's CHECK, REFERENCES, GENERATED or index options, a partition bound or key, or a table's or view's WITH options) is a syntax error at the end of input, as in PostgreSQL, instead of being accepted or failing on a later token.

- FROM, GROUP BY and WITH clauses parse as in PostgreSQL: `GROUP BY cube` / `rollup` name columns, a function's `alias(a, b int)` and a table's `alias(a b)` fail at the token PostgreSQL reports, a column definition list needs an alias (`f() (a int)` is a syntax error), a `USING (…) AS` join alias must be a column name (`AS order` is an error), a CYCLE mark value in parentheses is rejected, and a join word without JOIN, a bad CTE column list or a name as a CYCLE value is reported where PostgreSQL reports it.

- ORDER BY, GROUP BY and DISTINCT ON read a position the way PostgreSQL folds the constant: in any radix and with digit separators (`ORDER BY 0x2` is position 2, it was `non-integer constant in ORDER BY`), and under unary minus (`GROUP BY -1` and `ORDER BY - -5` are positions, `ORDER BY -1.5` is a non-integer constant); position 0 or a negative one is an error after a `*` too.

- SELECT's tail and FROM items are read as PostgreSQL reads them: a second LIMIT, OFFSET or FETCH, `LIMIT n, m`, FETCH without ROW or ROWS, WITH TIES without ORDER BY, `FOR UPDATE OF` without names, a locking clause both before and after LIMIT or on a parenthesized set operation, a table or parenthesized join after LATERAL, and `ONLY f()`, `ONLY (SELECT …)` or `ONLY t *` are errors; `FOR READ ONLY`, `FROM ONLY (t)`, `TABLE ONLY (t)`, `LATERAL current_date` (and the other function-like keywords) and `SELECT … INTO temp` (TEMP, TEMPORARY or UNLOGGED as the new table's name) are accepted.

- `CYCLE … SET mark TO v DEFAULT d` with a type that has no equality operator (box, circle, jsonpath, line, lseg, path, pg_snapshot, refcursor, txid_snapshot, besides point, polygon, json and xml) or no `<>` (aclitem, cid) is rejected, as in PostgreSQL; with a value of type `unknown` and NULL or another `unknown` the mark is text.

- A column assigned twice is rejected as in PostgreSQL: `column "c" specified more than once` in an INSERT or MERGE INSERT column list (assigning several of its elements or fields stays allowed), `multiple assignments to same column "c"` in an UPDATE, ON CONFLICT DO UPDATE or MERGE SET list; an UPDATE … FROM or DELETE … USING that reuses the target's name is `table name "t" specified more than once`.

- JSON_TABLE reports its errors in PostgreSQL's order: a path that is not a string constant, then a repeated column or path name, then an error in the context item, PASSING values or DEFAULTs, then a table name used twice.

- With ROLLUP, CUBE, GROUPING SETS or `GROUP BY ()`, a grouped column that some grouping set leaves out is typed nullable (it is NULL in that set's rows; a plain GROUP BY item is in every set and stays non-null), and aggregates are typed as without GROUP BY, since the empty set yields a row even for no input.

- A named function argument keeps its type when the overload is picked (`random(min => 1.5, max => 2.5)` is numeric, it was integer).

- A whole-row reference to a FROM item without columns (`(SELECT) s`) is typed nullable: on the null-extended side of an outer join it is NULL, which nothing else tells.

- A multi-column `SET (a, b) = (…)` checks a literal NULL, or a DEFAULT without a default, in a NOT NULL column like a single-column SET does, and a SET list reports PostgreSQL's first error: every value is typed before the target columns are checked.

- Build and type-check the package with `tsrs`.

- Type names take modifiers only where PostgreSQL's grammar does: `int(3)`, `double precision(3)`, `timestamp with time zone(3)`, `varchar(3, 4)`, `float(0)` / `float(54)`, `interval year to day`, `interval day(3)`, `interval(3) day`, `int[] array` and an unclosed modifier list (`'1'::numeric(5`) are errors, and a parenthesis right after an operand (`SELECT 1 (5`) is a syntax error instead of an operator.

- Operator results follow PostgreSQL in more cases: `0x…` / `0o…` / `0b…` literals and literals with leading zeros are typed by value (`0x1E` is int4, not numeric), bit-string `& | # ~ << >>` give `bit`, `int4[] || int8` is `int8[]`, `tsvector || text` is `text`, `money / $1` is float8, a `time` operand works as an interval (`ts - clock` is timestamp), `coalesce(varchar_col, name_col)` is `name`, and combinations PostgreSQL rejects (`ratio % 2`, `int4range + int4multirange`, `jsonb - int8`, `int4 || int4`) are `unknown` instead of a made-up type.
