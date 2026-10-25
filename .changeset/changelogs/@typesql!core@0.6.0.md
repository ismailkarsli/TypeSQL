## 0.6.0

### Minor Changes

- `@typesql/core/editor` is removed: editor completions moved to `@typesql/language-server`, which the VS Code extension bundles.

### Patch Changes

- `SELECT … INTO` inside a WITH query is rejected with PostgreSQL's `SELECT ... INTO is not allowed here` (it was read as a data-modifying WITH query), and that error points at the new table's name, as in PostgreSQL.

- Lexer errors read like PostgreSQL's: an unterminated literal names where it starts (`unterminated quoted string at or near "'abc"`, `unterminated bit string literal …`), and a character no token starts with is `syntax error at or near "\\"`.

- `UPDATE … SET (a) = x` with a source that is neither `ROW(…)` nor a subquery is an error, as in PostgreSQL (`source for a multiple-column UPDATE item must be a sub-SELECT or ROW() expression`).

- A window function in the operand of `IN (SELECT …)` is checked like any other (`window "w" does not exist`).

- `SELECT … INTO` without a table name is a syntax error, as in PostgreSQL, instead of being accepted.

- `$1 BETWEEN a AND b` types the parameter as `a` (`$1 BETWEEN id AND big` → `number`, not `string | number | bigint`), as in PostgreSQL, which resolves `$1 >= a` first.

- Bit strings (`B'101'`, `X'1F'`) are typed `bit` instead of `text`, and a digit that does not belong is an error (`"2" is not a valid binary digit`), as in PostgreSQL.

- `DECLARE` rejects contradictory options (`ASENSITIVE` with `INSENSITIVE`, `SCROLL` with `NO SCROLL`), and errors after `NO`, `WITH` / `WITHOUT` and a lone sign in `FETCH` point at the token PostgreSQL names.

- Subscripts of `point`, `line` (`float8`), `lseg`, `box` (`point`) and `name` (`"char"`) are typed as in PostgreSQL instead of `unknown`, and a `UESCAPE` at the end of the statement reports `UESCAPE must be followed by a simple string literal at end of input`.

- Syntax errors after a `WITH` that is not followed by `(` in CREATE TABLE / VIEW, after `UPDATE` without `SET` or `DO` without `NOTHING` in a MERGE action, and after an `AS` without a label point at the token PostgreSQL points at.

- A call decoration the function does not take is an error, as in PostgreSQL: `*`, `DISTINCT`, `FILTER` or `OVER` on a plain function (`lower(x) FILTER (…)`), a window function without `OVER`, and `count()` without `*`.

- A parameter in a numeric-category argument (`abs($1)`, `width_bucket($1, …)`) is `float8` (`number`) instead of `numeric`, and `to_tsvector($1)` / `ts_headline($1, …)` take text instead of jsonb, as PostgreSQL resolves them.

- A JSON step that misses (`x -> 'nope'`, an index past the end, a key on an array) is SQL NULL, so `coalesce(x -> 'nope', '[]')` is typed `[]` instead of `[] | null`.

- Subscripts in a row on an array (`a[1][2]`, `a[1][1:2]`) apply to the array together, as in PostgreSQL: they are typed as its element, or as the array when one is a slice, instead of `unknown`.

- Error messages name the `"char"` and `bit varying` types as PostgreSQL does (`cannot subscript type bit varying …`).

- A column of `CREATE TABLE … AS SELECT NULL AS x` or of a view over `SELECT NULL` is `text`, as in PostgreSQL, instead of a column that only takes `null`.

- A window function inside the array of `x = ANY (ARRAY[…])` is checked like any other (`window "w" does not exist`).

- An array slice is nullable when a bound is (`nums[n:2]`, `nums[NULL:2]`), as in PostgreSQL, and a subscript chain with a slice (`nums[1][1:2]`) is NULL only through a NULL array or subscript (out of range it is an empty array).

- `SUBSTRING` and `OVERLAY` of a `varbit` are typed `bit`, as in PostgreSQL.

- Subscripting an enum (`mood[1]`, in a query or as an assignment target) reports PostgreSQL's `cannot subscript type mood because it does not support subscripting`.

- The README is shorter: install, one example and links to the docs site, which now has the details it used to repeat.

- A sort order in an `ON CONFLICT` target (`ON CONFLICT (email DESC)`, `NULLS FIRST`) is an error, as in PostgreSQL.

- An ORDER BY / GROUP BY position written with leading zeros (`ORDER BY 01`) is that position, and one past the int4 range is a non-integer constant, as in PostgreSQL.

- `x IN (SELECT …)` and `x = ANY (SELECT …)` over a subquery without columns report `subquery has too few columns`, as PostgreSQL does.

- "Trailing junk" errors quote the whole junk token (`123abc`, `100__000`, `$0_1`), and invalid Unicode escapes in `E'…'` strings say where they are, as PostgreSQL does.

- An assignment target with `.*` (`SET col.* = …`, `INSERT INTO t (col.*)`) reports PostgreSQL's `row expansion via "*" is not supported here` at the column.

- Subscripting a value of a type without subscripts (`json`, `text`, …) is an error in any expression, and a `jsonb` slice is too, as in PostgreSQL; they were typed `unknown`.

- `ORDER BY` / `GROUP BY` / `DISTINCT ON` position errors (`ORDER BY position 2 is not in select list`) point at the number, as in PostgreSQL.

- A national character literal `N'abc'` is a `character` value (`string`), as in PostgreSQL, instead of `unknown`.

- `SELECT DISTINCT *` checks its ORDER BY too: an expression that is not in the select list (`ORDER BY id + 1`) is an error, as in PostgreSQL.

- A row compared with a subquery (`(a, b) = (SELECT x, y …)`) is a nullable boolean and needs a subquery of the same width, as in PostgreSQL; it was rejected as a scalar subquery with more than one column.

- DDL errors name relations as PostgreSQL does: a missing schema in `ALTER TABLE`, `DROP TABLE`, `INHERITS` or `LIKE` reports `schema "s" does not exist`, a missing relation there is spelled as written (`relation "public.t" does not exist`), `DROP` / `is not a table` messages use the bare name, and two parents with different column types report `inherited column "x" has a type conflict`.

- A typed literal with a schema-qualified type name, `pg_catalog.int4 '1'`, is accepted (the schema is dropped, as in casts) instead of being a syntax error.

- A missing relation written with `public.` keeps it in the error (`relation "public.t" does not exist`), and errors about a schema-qualified name point at the name, as in PostgreSQL.

- `INSERT INTO t AS excluded … ON CONFLICT DO UPDATE SET c = excluded.c` is an error (`table reference "excluded" is ambiguous`), as in PostgreSQL.

- Syntax errors in `1 + ANY 2`, `f(1 => x)`, `current_date()` and `localtime('a')` point at the token PostgreSQL points at, and `current_user(1)` is a syntax error, as in PostgreSQL.

- The merged column of `FULL JOIN … USING` / `NATURAL FULL JOIN` is nullable when either side's column is (a row without a match carries that side's NULL), as in PostgreSQL; it was non-null unless both were nullable.

- `U&'…' uescapeé` (UESCAPE followed by a non-ASCII letter) reads as an alias, as in PostgreSQL, instead of an error.
