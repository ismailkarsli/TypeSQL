import { expectTypeOf, test } from "vitest";
import type { KindOf } from "../../../src/engine/index.js";
import {
	type Col,
	createSql,
	type DefaultTypeMap,
	type Generated,
	type Nullable,
	type ParamsOf,
	type RowOf,
	type SqlError,
	type Validate,
	type View,
} from "../../../src/index.js";

interface DB {
	accounts: {
		id: Col<"int4">;
		balance: Col<"numeric">;
		note: Nullable<"text">;
		created_at: Generated<"timestamptz">;
	};
	deltas: {
		sid: Col<"int4">;
		delta: Col<"numeric">;
		label: Nullable<"text">;
	};
	active_accounts: View<{ id: Col<"int4"> }>;
}

const sql = createSql<DB>();
type Row<Q extends string> = RowOf<DB, DefaultTypeMap, Q>;
type Params<Q extends string> = ParamsOf<DB, DefaultTypeMap, Q>;
type V<Q extends string> = Validate<DB, Q>;

test("MERGE without RETURNING has no row type", () => {
	type Q =
		"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN MATCHED THEN UPDATE SET balance = a.balance + d.delta WHEN NOT MATCHED THEN INSERT (id, balance) VALUES (d.sid, d.delta)";
	expectTypeOf<V<Q>>().toEqualTypeOf<Q>();
	expectTypeOf<KindOf<DB, Q>>().toEqualTypeOf<"merge">();
	expectTypeOf<Row<Q>>().toEqualTypeOf<never>();
});

test("every WHEN form parses and validates", () => {
	type Q =
		`MERGE INTO ONLY accounts AS a USING (SELECT sid, delta FROM deltas WHERE delta > 0) AS d ON a.id = d.sid
    WHEN MATCHED AND a.balance > 100 THEN DELETE
    WHEN MATCHED AND d.delta = 0 THEN DO NOTHING
    WHEN MATCHED THEN UPDATE SET (balance, note) = (a.balance + d.delta, 'x')
    WHEN NOT MATCHED BY SOURCE AND a.balance = 0 THEN DELETE
    WHEN NOT MATCHED BY SOURCE THEN UPDATE SET note = 'orphan'
    WHEN NOT MATCHED BY TARGET AND d.delta > 1 THEN INSERT VALUES (d.sid, d.delta)
    WHEN NOT MATCHED THEN INSERT (id, balance, note) OVERRIDING USER VALUE VALUES (d.sid, d.delta, DEFAULT)`;
	expectTypeOf<V<Q>>().toEqualTypeOf<Q>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d JOIN accounts x ON x.id = d.sid ON a.id = d.sid WHEN MATCHED THEN DELETE">
	>().toEqualTypeOf<"MERGE INTO accounts a USING deltas d JOIN accounts x ON x.id = d.sid ON a.id = d.sid WHEN MATCHED THEN DELETE">();
	expectTypeOf<
		V<"MERGE INTO accounts a USING generate_series(1, 3) AS g ON a.id = g WHEN NOT MATCHED THEN INSERT (id, balance) VALUES (g, 0)">
	>().toEqualTypeOf<"MERGE INTO accounts a USING generate_series(1, 3) AS g ON a.id = g WHEN NOT MATCHED THEN INSERT (id, balance) VALUES (g, 0)">();
});

test("RETURNING: merge_action(), target, source and old / new", () => {
	expectTypeOf<
		Row<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN MATCHED THEN UPDATE SET balance = d.delta RETURNING merge_action(), a.*, d.label">
	>().toEqualTypeOf<{
		merge_action: string;
		id: number;
		balance: string;
		note: string | null;
		created_at: Date;
		label: string | null;
	}>();
	// NOT MATCHED BY SOURCE rows have no source row: its columns are NULL there
	expectTypeOf<
		Row<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED BY SOURCE THEN DELETE RETURNING a.id, d.sid">
	>().toEqualTypeOf<{ id: number; sid: number | null }>();
	expectTypeOf<
		Row<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED BY SOURCE THEN UPDATE SET note = 'x' RETURNING a.id, d.sid">
	>().toEqualTypeOf<{ id: number; sid: number | null }>();
	// ... unless that action is DO NOTHING (no row is returned)
	expectTypeOf<
		Row<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED BY SOURCE THEN DO NOTHING WHEN MATCHED THEN DELETE RETURNING d.sid">
	>().toEqualTypeOf<{ sid: number }>();
	// old is NULL for inserted rows, new for deleted rows
	expectTypeOf<
		Row<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN MATCHED THEN UPDATE SET balance = 1 RETURNING old.balance AS was, new.balance AS now">
	>().toEqualTypeOf<{ was: string; now: string }>();
	expectTypeOf<
		Row<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN MATCHED THEN DELETE WHEN NOT MATCHED THEN INSERT (id, balance) VALUES (d.sid, 0) RETURNING old.balance AS was, new.balance AS now">
	>().toEqualTypeOf<{ was: string | null; now: string | null }>();
	expectTypeOf<
		Row<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN INSERT (id, balance) VALUES (d.sid, 0) RETURNING WITH (OLD AS o, NEW AS n) o.id AS o_id, n.id AS n_id">
	>().toEqualTypeOf<{ o_id: number | null; n_id: number }>();
});

test("MERGE in a CTE and WITH ... MERGE", () => {
	expectTypeOf<
		Row<"WITH m AS (MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN MATCHED THEN DELETE RETURNING a.id, merge_action() AS act) SELECT id, act FROM m">
	>().toEqualTypeOf<{ id: number; act: string }>();
	expectTypeOf<
		Row<"WITH src AS (SELECT sid, delta FROM deltas) MERGE INTO accounts a USING src ON a.id = src.sid WHEN MATCHED THEN UPDATE SET balance = src.delta RETURNING a.balance">
	>().toEqualTypeOf<{ balance: string }>();
	expectTypeOf<
		V<"WITH m AS (MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN MATCHED THEN DELETE) SELECT * FROM m">
	>().toEqualTypeOf<
		SqlError<'WITH query "m" does not have a RETURNING clause', 1>
	>();
});

test("scopes: each WHEN clause sees what Postgres lets it see", () => {
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN INSERT (id, balance) VALUES (a.id, d.delta)">
	>().toEqualTypeOf<
		SqlError<'invalid reference to FROM-clause entry for table "a"', 3>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED AND a.balance = 1 THEN DO NOTHING">
	>().toEqualTypeOf<
		SqlError<'invalid reference to FROM-clause entry for table "a"', 3>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED BY SOURCE AND d.delta = 1 THEN DELETE">
	>().toEqualTypeOf<
		SqlError<'invalid reference to FROM-clause entry for table "d"', 6>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING (SELECT * FROM deltas WHERE a.id > sid) d ON a.id = d.sid WHEN MATCHED THEN DELETE">
	>().toEqualTypeOf<
		SqlError<'invalid reference to FROM-clause entry for table "a"', 3>
	>();
	// the matched clauses see both: an unqualified name in both is ambiguous
	expectTypeOf<
		V<"MERGE INTO accounts a USING accounts b ON a.id = b.id WHEN MATCHED THEN UPDATE SET balance = balance + 1">
	>().toEqualTypeOf<SqlError<'column reference "balance" is ambiguous', 20>>();
});

test("semantic errors", () => {
	expectTypeOf<
		V<"MERGE INTO accounts USING accounts ON true WHEN MATCHED THEN DO NOTHING">
	>().toEqualTypeOf<SqlError<'name "accounts" specified more than once', 2>>();
	expectTypeOf<
		V<"MERGE INTO active_accounts a USING deltas d ON a.id = d.sid WHEN MATCHED THEN DELETE">
	>().toEqualTypeOf<SqlError<'cannot merge into view "active_accounts"', 2>>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN MATCHED THEN UPDATE SET nope = 1">
	>().toEqualTypeOf<
		SqlError<
			'column "nope" of relation "accounts" does not exist. Perhaps you meant the column "note"?',
			20
		>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN INSERT (id) VALUES (d.sid)">
	>().toEqualTypeOf<
		SqlError<
			'null value in column "balance" of relation "accounts" violates not-null constraint',
			2
		>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN INSERT (id, balance) VALUES (d.sid)">
	>().toEqualTypeOf<
		SqlError<"INSERT has more target columns than expressions", 0>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN INSERT DEFAULT VALUES">
	>().toEqualTypeOf<
		SqlError<
			'null value in column "id" of relation "accounts" violates not-null constraint',
			10
		>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.nope = d.sid WHEN MATCHED THEN DELETE">
	>().toEqualTypeOf<
		SqlError<
			'column a.nope does not exist. Perhaps you meant the column "note"?',
			10
		>
	>();
	// a name that is nowhere keeps Postgres's "missing" wording
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN INSERT (id, balance) VALUES (zz.x, 1)">
	>().toEqualTypeOf<SqlError<'missing FROM-clause entry for table "zz"', 27>>();
	// INSERT: the checks of INSERT
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN INSERT (nope) VALUES (1)">
	>().toEqualTypeOf<
		SqlError<
			'column "nope" of relation "accounts" does not exist. Perhaps you meant the column "note"?',
			21
		>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN INSERT (id) VALUES (1, 2)">
	>().toEqualTypeOf<
		SqlError<"INSERT has more expressions than target columns", 0>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN INSERT VALUES (1, 2, 'x', now(), 5)">
	>().toEqualTypeOf<
		SqlError<"INSERT has more expressions than target columns", 0>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN INSERT (id, balance, note[1]) VALUES (1, 2, 'x')">
	>().toEqualTypeOf<
		SqlError<
			"cannot subscript type text because it does not support subscripting",
			0
		>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN INSERT (id, balance) VALUES (NULL, 1)">
	>().toEqualTypeOf<
		SqlError<
			'null value in column "id" of relation "accounts" violates not-null constraint',
			10
		>
	>();
	// a conditional clause of another kind in between changes nothing
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN MATCHED THEN DELETE WHEN NOT MATCHED AND d.delta > 0 THEN DO NOTHING WHEN MATCHED THEN DO NOTHING">
	>().toEqualTypeOf<
		SqlError<
			"unreachable WHEN clause specified after unconditional WHEN clause",
			0
		>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN MATCHED THEN DELETE WHEN MATCHED AND d.delta > 0 THEN DO NOTHING">
	>().toEqualTypeOf<
		SqlError<
			"unreachable WHEN clause specified after unconditional WHEN clause",
			0
		>
	>();
});

test("syntax errors", () => {
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected WHEN at or near end of input", 15>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN MATCHED THEN INSERT DEFAULT VALUES">
	>().toEqualTypeOf<
		SqlError<
			"syntax error: expected UPDATE, DELETE or DO NOTHING at or near insert",
			18
		>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN DELETE">
	>().toEqualTypeOf<
		SqlError<
			"syntax error: expected INSERT or DO NOTHING at or near delete",
			19
		>
	>();
	// UPDATE needs SET and DO needs NOTHING right after it: Postgres fails at the next token
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN MATCHED THEN UPDATE a SET balance = 0">
	>().toEqualTypeOf<SqlError<"syntax error at or near a", 19>>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN MATCHED THEN DO x">
	>().toEqualTypeOf<SqlError<"syntax error at or near x", 19>>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN DO x">
	>().toEqualTypeOf<SqlError<"syntax error at or near x", 20>>();
	expectTypeOf<V<"MERGE INTO accounts a">>().toEqualTypeOf<
		SqlError<"syntax error: expected USING at or near end of input", 4>
	>();
	expectTypeOf<V<"MERGE INTO accounts a USING deltas d">>().toEqualTypeOf<
		SqlError<"syntax error: expected ON at or near end of input", 7>
	>();
	// the target may be written `t *` (with its inheritance children, as by default)
	expectTypeOf<
		V<"MERGE INTO accounts * USING deltas d ON accounts.id = d.sid WHEN MATCHED THEN DELETE">
	>().toEqualTypeOf<"MERGE INTO accounts * USING deltas d ON accounts.id = d.sid WHEN MATCHED THEN DELETE">();
	expectTypeOf<
		V<"MERGE accounts USING deltas ON true WHEN MATCHED THEN DELETE">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected INTO at or near accounts", 1>
	>();
});

test("syntax errors in every part of the statement; BY TARGET and OVERRIDING", () => {
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON true WHEN MATCHED THEN DELETE RETURNING">
	>().toEqualTypeOf<SqlError<"syntax error at end of input", 14>>();
	expectTypeOf<V<"MERGE INTO accounts a USING deltas d ON (">>().toEqualTypeOf<
		SqlError<"syntax error at end of input", 9>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING (SELECT ON true">
	>().toEqualTypeOf<SqlError<"syntax error at or near on", 7>>();
	expectTypeOf<V<"MERGE INTO 1 USING deltas d ON true">>().toEqualTypeOf<
		SqlError<"syntax error: expected table name at or near 1", 2>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON true WHEN x THEN DELETE">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected MATCHED or NOT MATCHED at or near x", 10>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON true WHEN MATCHED AND ( THEN DELETE">
	>().toEqualTypeOf<SqlError<"syntax error at or near then", 13>>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON true WHEN MATCHED DELETE">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected THEN at or near delete", 11>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON true WHEN MATCHED THEN UPDATE SET">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected column name at or near end of input", 14>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON true WHEN NOT MATCHED THEN INSERT (id">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected "," or ")" at or near end of input', 16>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON true WHEN NOT MATCHED THEN INSERT (id, balance) OVERRIDING x VALUE VALUES (1, 2)">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected SYSTEM or USER at or near x", 20>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON true WHEN NOT MATCHED THEN INSERT (id) (1)">
	>().toEqualTypeOf<
		SqlError<"syntax error: expected VALUES at or near (", 17>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON true WHEN NOT MATCHED THEN INSERT (id) VALUES 1">
	>().toEqualTypeOf<SqlError<'syntax error: expected "(" at or near 1', 18>>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON true WHEN NOT MATCHED THEN INSERT (id) VALUES (1">
	>().toEqualTypeOf<
		SqlError<'syntax error: expected ")" at or near end of input', 20>
	>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON true WHEN NOT MATCHED THEN INSERT (id) VALUES (,)">
	>().toEqualTypeOf<SqlError<"syntax error at or near ,", 19>>();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON true WHEN NOT MATCHED BY TARGET THEN DO NOTHING">
	>().toEqualTypeOf<"MERGE INTO accounts a USING deltas d ON true WHEN NOT MATCHED BY TARGET THEN DO NOTHING">();
	expectTypeOf<
		V<"MERGE INTO accounts a USING deltas d ON true WHEN NOT MATCHED THEN INSERT (id, balance) OVERRIDING USER VALUE VALUES (1, 2)">
	>().toEqualTypeOf<"MERGE INTO accounts a USING deltas d ON true WHEN NOT MATCHED THEN INSERT (id, balance) OVERRIDING USER VALUE VALUES (1, 2)">();
});

test("parameters take their context's type", () => {
	expectTypeOf<
		Params<"MERGE INTO accounts a USING deltas d ON a.id = d.sid AND d.delta > $1 WHEN MATCHED AND a.note = $2 THEN UPDATE SET balance = $3, note = $4 WHEN NOT MATCHED THEN INSERT (id, balance, note) VALUES ($5, $6, $7)">
	>().toEqualTypeOf<
		[
			string | number | bigint | null,
			string | null,
			string | number | bigint,
			string | null,
			number,
			string | number | bigint,
			string | null,
		]
	>();
	expectTypeOf<
		Params<"MERGE INTO accounts a USING (SELECT * FROM deltas WHERE sid = $1) d ON a.id = d.sid WHEN MATCHED THEN DELETE RETURNING $2::text AS tag">
	>().toEqualTypeOf<[number | null, string]>();
	// without a column list the columns' order is unknown (a TS object type has no key order)
	expectTypeOf<
		Params<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN INSERT VALUES ($1, $2)">
	>().toEqualTypeOf<[unknown, unknown]>();
	expectTypeOf<
		Params<"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN INSERT VALUES ($1::int4, 0)">
	>().toEqualTypeOf<[number]>();
	// an INSERT column with a subscript takes the element's type
	interface Tagged {
		items: { id: Col<"int4">; tags: Nullable<"text[]"> };
	}
	expectTypeOf<
		ParamsOf<
			Tagged,
			DefaultTypeMap,
			"MERGE INTO items i USING items s ON i.id = s.id WHEN NOT MATCHED THEN INSERT (id, tags[1]) VALUES ($1, $2)"
		>
	>().toEqualTypeOf<[number, string | null]>();
});

test("sql() call sites", () => {
	sql(
		"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN INSERT (id, balance) VALUES ($1, $2)",
		1,
		"10",
	);
	sql(
		"MERGE INTO accounts a USING deltas d ON a.id = d.sid WHEN NOT MATCHED THEN INSERT (id, balance) VALUES ($1, $2)",
		// @ts-expect-error wrong parameter type
		"x",
		"10",
	);
});
