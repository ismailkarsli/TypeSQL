## 0.3.0

### Minor Changes

- Parse cursor statements (`DECLARE ... CURSOR FOR query` checks its query and types its parameters; `FETCH`, `MOVE`, `CLOSE`), `END`, `ABORT` and `REASSIGN OWNED`, and more DDL as PostgreSQL 18 does: `CREATE RECURSIVE VIEW`, `CREATE SCHEMA` with embedded elements (applied by `ApplyDdl`), table-level and `ALTER TABLE ... ADD` `NOT NULL col`, `NO INHERIT`, `[NOT] ENFORCED`, `WITHOUT OVERLAPS` keys, `CREATE TABLE ... OF type`, `AS EXECUTE`, any type modifier list and any `PARTITION BY` strategy.

- Any operator Postgres can lex is accepted: user-defined and geometric operators such as `*=`, `~<~`, `|>>` or `@-@`, prefix operators like `@@ box` and `OPERATOR(schema.op) x`; built-in geometric tests type as `boolean`, unknown operators as `unknown`.

- Parse and type more PostgreSQL expression syntax: typed literals with keyword type names (`timestamp with time zone '…'`, `char(20) '…'`, `interval(2) '…'`), named (`f(a => 1)`, `f(a := 1)`) and `VARIADIC` arguments, `x LIKE ANY (…)` and `op ANY/ALL` with every operator, `(a, b) OVERLAPS (c, d)`, `AT LOCAL`, `IS [NFC|…] NORMALIZED`, `COLLATION FOR (…)`, `SUBSTRING(… SIMILAR … ESCAPE …)`, `e[i].field`, several `WITHIN GROUP` sort keys, and `CURRENT_DATE`, `CAST(…)` or `COLLATION FOR (…)` in FROM.

- Queries can use `ROWS FROM (f(…), g(…)) [WITH ORDINALITY]`, `TABLESAMPLE method (…) [REPEATABLE (…)]`, `SEARCH` / `CYCLE` on recursive CTEs (the columns they add are typed), joins nested Postgres-style (`a JOIN b LEFT JOIN c ON … ON …`, `((SELECT …) s JOIN t ON …) j`) and `WITHIN GROUP (ORDER BY a, b)`.

- SQL/XML is parsed and typed: `XMLELEMENT(NAME n, XMLATTRIBUTES(…), …)`, `XMLFOREST`, `XMLCONCAT`, `XMLPI`, `XMLROOT`, `XMLPARSE`, `XMLSERIALIZE(… AS type)`, `XMLEXISTS(… PASSING …)`, `IS [NOT] DOCUMENT` and `XMLTABLE(… COLUMNS …)` in `FROM`, with Postgres's column names, types and nullability.

- The SQL/JSON syntax of PostgreSQL 16+ parses and is typed: `JSON_OBJECT`, `JSON_ARRAY` (values or a query), `JSON_OBJECTAGG` / `JSON_ARRAYAGG`, `JSON`, `JSON_SCALAR`, `JSON_SERIALIZE`, `JSON_EXISTS` / `JSON_VALUE` / `JSON_QUERY` with all their clauses, `IS [NOT] JSON`, and `JSON_TABLE` in FROM with typed columns.

- Queries can use `MERGE` (`WHEN [NOT] MATCHED [BY SOURCE | BY TARGET]`, `RETURNING` with `merge_action()`, inside `WITH`), `RETURNING old.*` / `new.*` and `RETURNING WITH (OLD AS o, NEW AS n)`, array, `jsonb` and field assignment targets (`SET a[1] = $1`, `INSERT INTO t (c.f)`), `WHERE CURRENT OF` and `SELECT … INTO new_table`, all checked and typed like PostgreSQL 18.

### Patch Changes

- The package description and README say the parser is tested against PostgreSQL 18's regression suite and link to how.

- Strings and numbers lex like Postgres: `E'\\'` and other escaped backslashes before the closing quote, string literals continued on the next line, `U&'…'` / `U&"…"` with `UESCAPE`, invalid Unicode escapes and trailing junk such as `123abc` are errors, and numbers of any length no longer fail with TS2589.

- Recognising `SELECT … INTO` costs ordinary SELECT statements less type-checking work.

- A JOIN's `ON` condition can only reference the two sides of its join, `SELECT DISTINCT` needs a target list, and a function in `FROM` cannot have `OVER` / `FILTER` / `WITHIN GROUP`, as in Postgres.

- The pattern forms of `SUBSTRING` (`FROM 'regex'`, `SIMILAR … ESCAPE …`) are nullable, `FETCH … WITH TIES` may be followed by `OFFSET`, and `CREATE VIEW … USING` is a syntax error, as in Postgres.
