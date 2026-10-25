import { expectTypeOf, test } from "vitest";
import type {
	ApplyDdl,
	Col,
	Generated,
	Nullable,
	NullableGenerated,
	SqlError,
	Validate,
	View,
} from "../../src/index.js";

// The DDL parser's corners (parser/ddl.ts): how statements without a schema effect are skipped,
// and the syntax errors of the statements it parses. Every statement was run on PostgreSQL 18;
// messages match it except where a comment says TypeSQL differs.
type D<Q extends string> = ApplyDdl<{}, Q>;
/** The relations (and `$functions` / `$types`) a script leaves. */
type K<Q extends string> = keyof D<Q>;

test("a statement without schema effect is skipped up to its own `;`", () => {
	expectTypeOf<
		[
			// `,` at depth 0, `;` inside parentheses, nested parentheses
			K<"CREATE TABLE t (a int); GRANT SELECT, INSERT ON t TO public; CREATE TABLE x (b int)">,
			K<"CREATE TABLE t (a int); CREATE RULE r AS ON INSERT TO t DO ALSO (NOTIFY a; NOTIFY b); CREATE TABLE x (b int)">,
			K<"CREATE TABLE t (a int); CREATE INDEX ON t ((a + 1), (a * (2))); CREATE TABLE x (b int)">,
			K<"CREATE TABLE t (a int); COMMENT ON TABLE t IS 'x'">,
		]
	>().toEqualTypeOf<["t" | "x", "t" | "x", "t" | "x", "t"]>();
	// a table constraint without schema effect is skipped up to its `,` or `)`
	expectTypeOf<
		D<"CREATE TABLE t (a int, b int, CHECK ((a) > 0), CHECK (((a)) > b), c int)">
	>().toEqualTypeOf<{
		t: { a: Nullable<"int4">; b: Nullable<"int4">; c: Nullable<"int4"> };
	}>();
});

test("a routine is skipped up to its `;`, a BEGIN ATOMIC body up to its END", () => {
	expectTypeOf<
		[
			K<"CREATE PROCEDURE p() LANGUAGE sql AS 'SELECT 1'; CREATE TABLE x (b int)">,
			K<"CREATE PROCEDURE p() LANGUAGE sql AS 'SELECT 1'">,
			K<"CREATE PROCEDURE p() LANGUAGE sql BEGIN ATOMIC SELECT 1; END">,
			// CASE ... END inside the body; the body's statements read the parameters
			K<"CREATE FUNCTION f(a int) RETURNS int LANGUAGE sql BEGIN ATOMIC SELECT CASE WHEN a > 0 THEN 1 END; SELECT a; END; CREATE TABLE x (b int)">,
			K<"CREATE PROCEDURE p(a int) LANGUAGE sql BEGIN ATOMIC SELECT 1; SELECT a; END; CREATE TABLE x (b int)">,
			// BEGIN without ATOMIC is a word; BEGIN ATOMIC inside parentheses is a parameter
			K<"CREATE FUNCTION f() RETURNS int LANGUAGE sql SET search_path = begin RETURN 1; CREATE TABLE x (b int)">,
			K<"CREATE TYPE atomic AS ENUM ('x'); CREATE FUNCTION f(begin atomic) RETURNS int LANGUAGE sql RETURN 1; CREATE TABLE x (b int)">,
			K<"CREATE TYPE atomic AS ENUM ('x'); CREATE PROCEDURE p(begin atomic) LANGUAGE sql AS 'SELECT 1'; CREATE TABLE x (b int)">,
		]
	>().toEqualTypeOf<
		[
			"x",
			never,
			never,
			"$functions" | "x",
			"x",
			"$functions" | "x",
			"$functions" | "$types" | "x",
			"$types" | "x",
		]
	>();
	// the body comes last
	expectTypeOf<
		[
			D<"CREATE FUNCTION f() RETURNS int LANGUAGE sql BEGIN ATOMIC SELECT 1; END IMMUTABLE">,
			D<"CREATE PROCEDURE p() BEGIN ATOMIC SELECT 1; END LANGUAGE sql">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error at or near immutable", 15>,
			SqlError<"syntax error at or near language", 11>,
		]
	>();
	// TypeSQL says "at or near end of input" where Postgres says "at end of input"
	expectTypeOf<
		[
			D<"CREATE PROCEDURE p() LANGUAGE sql BEGIN ATOMIC SELECT 1;">,
			D<"CREATE FUNCTION f() RETURNS int LANGUAGE sql BEGIN ATOMIC SELECT 1">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error at or near end of input", 12>,
			SqlError<"syntax error at or near end of input", 13>,
		]
	>();
});

test("a dangling dot after a name is a syntax error at the next token", () => {
	expectTypeOf<
		[
			D<"CREATE TYPE a.b.">,
			D<"CREATE TYPE a.">,
			D<"CREATE TYPE a.b.c.">,
			D<"CREATE SCHEMA a CREATE SEQUENCE a.b.">,
			D<"CREATE SCHEMA a CREATE INDEX ON a.b. (x)">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error at or near end of input", 6>,
			SqlError<"syntax error at or near end of input", 4>,
			SqlError<"syntax error at or near end of input", 8>,
			SqlError<"syntax error at or near end of input", 9>,
			SqlError<"syntax error at or near (", 10>,
		]
	>();
	// TypeSQL: a syntax error; Postgres: improper qualified name (too many dotted names): a.b.c.d
	expectTypeOf<D<"CREATE TYPE a.b.c.d">>().toEqualTypeOf<
		SqlError<"syntax error at or near d", 8>
	>();
	expectTypeOf<
		D<"CREATE SCHEMA a CREATE TABLE b (x int) CREATE INDEX ON a.b (x) CREATE SEQUENCE a.s">
	>().toEqualTypeOf<{ a: { b: { x: Nullable<"int4"> } } }>();
});

test("every CREATE without schema effect", () => {
	expectTypeOf<
		[
			K<`CREATE TABLE t (a int, b int);
        CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
        CREATE INDEX ON t (a); CREATE UNIQUE INDEX ON t (b);
        CREATE TRIGGER tr BEFORE INSERT ON t FOR EACH ROW EXECUTE FUNCTION f();
        CREATE CONSTRAINT TRIGGER ct AFTER INSERT ON t FOR EACH ROW EXECUTE FUNCTION f();
        CREATE EXTENSION IF NOT EXISTS citext; CREATE SEQUENCE sq; CREATE POLICY p ON t USING (true);
        CREATE RULE r AS ON INSERT TO t DO NOTHING; CREATE DOMAIN d AS int;
        CREATE AGGREGATE agg (int) (SFUNC = int4pl, STYPE = int);
        CREATE OPERATOR === (FUNCTION = int4eq, LEFTARG = int, RIGHTARG = int);
        CREATE ROLE r1; CREATE USER u1; CREATE GROUP g1; CREATE COLLATION c1 FROM "C";
        CREATE CAST (d AS point) WITH INOUT;
        CREATE TABLE x (b int)`>,
			K<`CREATE FUNCTION ef() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN END $$;
        CREATE EVENT TRIGGER et ON ddl_command_start EXECUTE FUNCTION ef();
        CREATE PUBLICATION pub;
        CREATE SUBSCRIPTION sub CONNECTION 'dbname=x' PUBLICATION pub WITH (connect = false);
        CREATE FOREIGN DATA WRAPPER w; CREATE SERVER srv FOREIGN DATA WRAPPER w;
        CREATE TABLE t (a int, b int); CREATE STATISTICS st ON a, b FROM t;
        CREATE TEXT SEARCH CONFIGURATION cfg (COPY = english);
        CREATE TRUSTED LANGUAGE plx HANDLER plpgsql_call_handler;
        CREATE PROCEDURAL LANGUAGE ply HANDLER plpgsql_call_handler;
        CREATE LANGUAGE plz HANDLER plpgsql_call_handler;
        CREATE CONVERSION cv FOR 'UTF8' TO 'LATIN1' FROM utf8_to_iso8859_1;
        CREATE DEFAULT CONVERSION cv2 FOR 'UTF8' TO 'LATIN1' FROM utf8_to_iso8859_1;
        CREATE ACCESS METHOD am TYPE INDEX HANDLER bthandler;
        CREATE TRANSFORM FOR int LANGUAGE sql (FROM SQL WITH FUNCTION brin_minmax_opcinfo(internal), TO SQL WITH FUNCTION int4recv(internal));
        CREATE TABLE x (b int)`>,
		]
	>().toEqualTypeOf<["$functions" | "t" | "x", "$functions" | "t" | "x"]>();
	// not run in a transaction block: checked as statements
	expectTypeOf<
		[
			Validate<{}, "CREATE DATABASE d">,
			Validate<{}, "CREATE TABLESPACE ts LOCATION '/tmp'">,
		]
	>().toEqualTypeOf<
		["CREATE DATABASE d", "CREATE TABLESPACE ts LOCATION '/tmp'"]
	>();
	expectTypeOf<
		D<"CREATE TEMP TABLE a (x int); CREATE TEMPORARY TABLE b (x int); CREATE UNLOGGED TABLE c (x int); CREATE GLOBAL TEMP TABLE d (x int); CREATE LOCAL TEMPORARY TABLE e (x int)">
	>().toEqualTypeOf<{
		a: { x: Nullable<"int4"> };
		b: { x: Nullable<"int4"> };
		c: { x: Nullable<"int4"> };
		d: { x: Nullable<"int4"> };
		e: { x: Nullable<"int4"> };
	}>();
});

test("ALTER TABLE: an action without schema effect is skipped up to its `,` or `;`", () => {
	expectTypeOf<
		K<"CREATE TABLE t (a int); ALTER TABLE t OWNER TO CURRENT_USER; CREATE TABLE x (b int)">
	>().toEqualTypeOf<"t" | "x">();
});

test("DROP: name lists, CASCADE and RESTRICT", () => {
	expectTypeOf<[D<"DROP TABLE">, D<"DROP TABLE a,">]>().toEqualTypeOf<
		[
			SqlError<"syntax error: expected name at or near end of input", 2>,
			SqlError<"syntax error: expected name at or near end of input", 4>,
		]
	>();
	expectTypeOf<
		[
			D<"CREATE TABLE a (x int); CREATE TABLE b (x int); CREATE TABLE c (x int); DROP TABLE a, b">,
			D<"DROP TABLE IF EXISTS a, b">,
			D<"CREATE TYPE e AS ENUM ('a'); CREATE TABLE t (x e, y int); DROP TYPE e CASCADE">,
		]
	>().toEqualTypeOf<
		[
			{ c: { x: Nullable<"int4"> } },
			{},
			{ $types: {}; t: { y: Nullable<"int4"> } },
		]
	>();
	expectTypeOf<
		[
			D<"CREATE SCHEMA s; CREATE TABLE s.t (x int); DROP SCHEMA s RESTRICT">,
			D<"CREATE TYPE e AS ENUM ('a'); CREATE TABLE t (x e, y int); DROP TYPE e RESTRICT">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"cannot drop schema s because other objects depend on it", 16>,
			SqlError<"cannot drop type e because other objects depend on it", 22>,
		]
	>();
});

test("CREATE: the object types, and their syntax errors", () => {
	expectTypeOf<
		[
			D<"CREATE OR VIEW v AS SELECT 1">,
			D<"CREATE MATERIALIZED TABLE t (a int)">,
			D<"CREATE OR REPLACE MATERIALIZED VIEW v AS SELECT 1 AS a">,
			D<"CREATE RECURSIVE TABLE t (a int)">,
			D<"CREATE FOO x">,
			D<"CREATE">,
			D<"CREATE 1">,
			D<"CREATE MATERIALIZED VIEW v AS SELECT 1 AS a; CREATE MATERIALIZED VIEW v AS SELECT 1 AS a">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error: expected REPLACE at or near view", 2>,
			SqlError<"syntax error: expected VIEW at or near table", 2>,
			SqlError<"syntax error at or near materialized", 3>,
			SqlError<"syntax error: expected VIEW at or near table", 2>,
			SqlError<
				"syntax error: expected TABLE, VIEW, TYPE, SCHEMA, INDEX, FUNCTION, ... after CREATE at or near foo",
				1
			>,
			SqlError<
				"syntax error: expected object type after CREATE at or near end of input",
				1
			>,
			SqlError<
				"syntax error: expected object type after CREATE at or near 1",
				1
			>,
			SqlError<'relation "v" already exists', 13>,
		]
	>();
	expectTypeOf<
		D<"CREATE MATERIALIZED VIEW v AS SELECT 1 AS a; CREATE MATERIALIZED VIEW IF NOT EXISTS v AS SELECT 2 AS b">
	>().toEqualTypeOf<{ v: View<{ a: Col<"int4"> }> }>();
});

test("CREATE FUNCTION: its name, parameters and result type", () => {
	expectTypeOf<
		[
			D<"CREATE FUNCTION f RETURNS int LANGUAGE sql RETURN 1">,
			D<"CREATE FUNCTION 1() RETURNS int LANGUAGE sql RETURN 1">,
			D<"CREATE FUNCTION f() RETURNS 1 LANGUAGE sql RETURN 1">,
			D<"CREATE FUNCTION f() RETURNS SETOF 1 LANGUAGE sql RETURN 1">,
		]
	>().toEqualTypeOf<
		[
			SqlError<'syntax error: expected "(" at or near returns', 3>,
			SqlError<"syntax error: expected function name at or near 1", 2>,
			SqlError<"syntax error: expected type name at or near 1", 6>,
			SqlError<"syntax error: expected type name at or near 1", 7>,
		]
	>();
});

test("CREATE TABLE AS, typed tables: their syntax errors", () => {
	expectTypeOf<D<"CREATE TABLE t (a, b) AS SELECT 1, 2">>().toEqualTypeOf<{
		t: { a: Nullable<"int4">; b: Nullable<"int4"> };
	}>();
	expectTypeOf<
		[
			D<"CREATE TABLE t (a, 1) AS SELECT 1, 2">,
			D<"CREATE TABLE t AS EXECUTE q (1">,
			D<"CREATE TABLE t AS EXECUTE q (1 +)">,
			D<"CREATE TABLE t AS EXECUTE 1">,
			D<"CREATE TABLE t OF person_type PARTITION BY RANGE">,
			D<"CREATE TABLE t OF 1">,
			D<"CREATE TABLE t OF person_type (a WITH OPTIONS NOT NULL 1)">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error: expected identifier at or near 1", 6>,
			SqlError<'syntax error: expected ")" at or near end of input', 8>,
			SqlError<"syntax error at or near )", 9>,
			SqlError<
				"syntax error: expected prepared statement name at or near 1",
				5
			>,
			SqlError<'syntax error: expected "(" at or near end of input', 8>,
			SqlError<"syntax error: expected type name at or near 1", 4>,
			SqlError<'syntax error: expected "," or ")" at or near 1', 11>,
		]
	>();
	// TypeSQL: not supported; Postgres: q and person_type do not exist
	expectTypeOf<
		[
			D<"CREATE TABLE t AS EXECUTE q">,
			D<"CREATE TABLE t OF person_type (a WITH OPTIONS NULL)">,
		]
	>().toEqualTypeOf<
		[
			SqlError<
				"CREATE TABLE ... AS EXECUTE q is not supported: the columns of a prepared statement are unknown",
				0
			>,
			SqlError<
				'typed table "t" (CREATE TABLE ... OF person_type) is not supported: TypeSQL does not track the columns of composite types; list the columns',
				2
			>,
		]
	>();
});

test("PARTITION OF: the bound, and INHERITS: their syntax errors", () => {
	// one expectation each: in a tuple, these four fail against the type cache (test/cache/equiv), though each holds
	type PC = { c: { a: Nullable<"int4"> }; p: { a: Nullable<"int4"> } };
	expectTypeOf<
		D<"CREATE TABLE p (a int) PARTITION BY LIST (a); CREATE TABLE c PARTITION OF p DEFAULT">
	>().toEqualTypeOf<PC>();
	expectTypeOf<
		D<"CREATE TABLE p (a int) PARTITION BY LIST (a); CREATE TABLE c PARTITION OF p FOR VALUES IN (1, 2)">
	>().toEqualTypeOf<PC>();
	expectTypeOf<
		D<"CREATE TABLE p (a int) PARTITION BY HASH (a); CREATE TABLE c PARTITION OF p FOR VALUES WITH (MODULUS 2, REMAINDER 0)">
	>().toEqualTypeOf<PC>();
	expectTypeOf<
		D<"CREATE TABLE p (a int) PARTITION BY RANGE (a); CREATE TABLE c PARTITION OF p FOR VALUES FROM (MINVALUE) TO (10)">
	>().toEqualTypeOf<PC>();
	expectTypeOf<
		[
			D<"CREATE TABLE p (a int) PARTITION BY LIST (a); CREATE TABLE c PARTITION OF p DEFAULT PARTITION BY RANGE">,
			D<"CREATE TABLE c PARTITION OF 1 DEFAULT">,
			D<"CREATE TABLE p (a int) PARTITION BY LIST (a); CREATE TABLE c PARTITION OF p">,
			D<"CREATE TABLE p (a int) PARTITION BY LIST (a); CREATE TABLE c PARTITION OF p FOR VALUES IN 1">,
			D<"CREATE TABLE p (a int) PARTITION BY RANGE (a); CREATE TABLE c PARTITION OF p FOR VALUES FROM (1)">,
			D<"CREATE TABLE p (a int) PARTITION BY RANGE (a); CREATE TABLE c PARTITION OF p FOR VALUES FROM (1) TO 2">,
			D<"CREATE TABLE p (a int) PARTITION BY RANGE (a); CREATE TABLE c PARTITION OF p FOR VALUES FROM 1">,
			D<"CREATE TABLE p (a int) PARTITION BY RANGE (a); CREATE TABLE c PARTITION OF p FOR VALUES TO (1)">,
			D<"CREATE TABLE p (a int); CREATE TABLE c (b int) INHERITS p">,
			D<"CREATE TABLE c (b int) INHERITS (1)">,
			D<"CREATE TABLE p (a int); CREATE TABLE c (b int) INHERITS (p">,
		]
	>().toEqualTypeOf<
		[
			SqlError<'syntax error: expected "(" at or near end of input', 24>,
			SqlError<"syntax error: expected parent table name at or near 1", 5>,
			SqlError<
				"syntax error: expected FOR VALUES or DEFAULT at or near end of input",
				20
			>,
			SqlError<'syntax error: expected "(" at or near 1', 23>,
			SqlError<"syntax error: expected TO at or near end of input", 26>,
			SqlError<'syntax error: expected "(" at or near 2', 27>,
			SqlError<'syntax error: expected "(" at or near 1', 23>,
			SqlError<"syntax error: expected IN, FROM or WITH at or near to", 22>,
			SqlError<'syntax error: expected "(" at or near p', 16>,
			SqlError<"syntax error: expected name at or near 1", 9>,
			SqlError<'syntax error: expected ")" at or near end of input', 18>,
		]
	>();
});

test("column constraints, their syntax errors and NULL / NOT NULL conflicts", () => {
	expectTypeOf<
		[
			D<"CREATE TABLE t (a int CONSTRAINT c NOT NULL, b int CONSTRAINT d NULL)">,
			D<"CREATE TABLE t (a int NOT NULL NO INHERIT, b int UNIQUE NOT DEFERRABLE, c int CHECK (c > 0) NOT ENFORCED)">,
			D<"CREATE TABLE t (a int UNIQUE NULLS DISTINCT, b int UNIQUE NULLS NOT DISTINCT USING INDEX TABLESPACE pg_default, c int PRIMARY KEY WITH (fillfactor = 70) USING INDEX TABLESPACE pg_default NOT NULL)">,
			D<"CREATE TABLE t (a int CHECK (a > 0) NO INHERIT NOT NULL)">,
			D<"CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (a int REFERENCES u MATCH SIMPLE ON DELETE SET NULL (a) ON UPDATE SET DEFAULT NOT NULL, b int REFERENCES u (id) ON DELETE NO ACTION ON UPDATE RESTRICT NOT NULL, c int REFERENCES u ON DELETE CASCADE NOT NULL)">,
			D<"CREATE TABLE t (a int GENERATED BY DEFAULT AS IDENTITY (START 1) NOT NULL, b int GENERATED ALWAYS AS (a + 1) STORED NOT NULL, c int GENERATED ALWAYS AS (a * 2) VIRTUAL)">,
			D<"CREATE TABLE t (a int UNIQUE DEFERRABLE INITIALLY DEFERRED NOT NULL, b int UNIQUE INITIALLY IMMEDIATE NOT NULL)">,
			D<'CREATE TABLE t (a text COLLATE "C" NOT NULL, b text STORAGE external COMPRESSION pglz COLLATE pg_catalog."default" NOT NULL, c text STORAGE main NOT NULL, d text COMPRESSION pglz NOT NULL)'>,
			D<"CREATE TABLE t (a bool DEFAULT 1 = 1 NOT NULL, b bool DEFAULT 1 IS DISTINCT FROM 2 NOT NULL, c bool DEFAULT 1 IS NOT DISTINCT FROM 2 NOT NULL)">,
		]
	>().toEqualTypeOf<
		[
			{ t: { a: Col<"int4">; b: Nullable<"int4"> } },
			{ t: { a: Col<"int4">; b: Nullable<"int4">; c: Nullable<"int4"> } },
			{ t: { a: Nullable<"int4">; b: Nullable<"int4">; c: Col<"int4"> } },
			{ t: { a: Col<"int4"> } },
			{
				t: { a: Col<"int4">; b: Col<"int4">; c: Col<"int4"> };
				u: { id: Col<"int4"> };
			},
			{
				t: {
					a: Generated<"int4">;
					b: Generated<"int4">;
					c: NullableGenerated<"int4">;
				};
			},
			{ t: { a: Col<"int4">; b: Col<"int4"> } },
			{ t: { a: Col<"text">; b: Col<"text">; c: Col<"text">; d: Col<"text"> } },
			{
				t: { a: Generated<"bool">; b: Generated<"bool">; c: Generated<"bool"> };
			},
		]
	>();
	expectTypeOf<
		[
			D<"CREATE TABLE t (a int CONSTRAINT 1)">,
			D<"CREATE TABLE t (a int NULL NOT NULL)">,
			D<"CREATE TABLE t (a int NOT NULL NULL)">,
			D<"CREATE TABLE t (a int NOT x)">,
			D<"CREATE TABLE t (a int DEFAULT )">,
			D<"CREATE TABLE t (a int PRIMARY x)">,
			D<"CREATE TABLE t (a int CHECK a > 0)">,
			D<"CREATE TABLE t (a int REFERENCES 1)">,
			D<"CREATE TABLE t (a int NULL GENERATED ALWAYS AS IDENTITY)">,
			D<"CREATE TABLE t (a int GENERATED x)">,
			D<"CREATE TABLE t (a int GENERATED ALWAYS AS 1)">,
			D<"CREATE TABLE t (a text COLLATE 1)">,
			D<"CREATE TABLE t (a int FOO)">,
			D<"CREATE TABLE t (a bool DEFAULT 1 IS NULL)">,
			D<"CREATE TABLE t (a bool DEFAULT 1 < 2 < 3)">,
			D<"CREATE TABLE t (c int UNIQUE INCLUDE (c))">,
			D<"CREATE TABLE t (c int PRIMARY KEY WITH x)">,
			D<"CREATE TABLE t (b text COMPRESSION pglz STORAGE external)">,
			D<"CREATE TABLE t (b text NOT NULL STORAGE external)">,
			D<"CREATE TABLE t (b text NOT NULL COMPRESSION pglz)">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error: expected constraint name at or near 1", 7>,
			SqlError<
				'conflicting NULL/NOT NULL declarations for column "a" of table "t"',
				7
			>,
			SqlError<
				'conflicting NULL/NOT NULL declarations for column "a" of table "t"',
				8
			>,
			SqlError<"syntax error: expected NULL at or near x", 7>,
			SqlError<"syntax error at or near )", 7>,
			SqlError<"syntax error: expected KEY at or near x", 7>,
			SqlError<'syntax error: expected "(" at or near a', 7>,
			SqlError<"syntax error: expected referenced table at or near 1", 7>,
			SqlError<
				'conflicting NULL/NOT NULL declarations for column "a" of table "t"',
				7
			>,
			SqlError<"syntax error: expected ALWAYS or BY DEFAULT at or near x", 7>,
			SqlError<'syntax error: expected "(" or IDENTITY at or near 1', 9>,
			SqlError<"syntax error: expected collation name at or near 1", 7>,
			SqlError<"syntax error: expected column constraint at or near foo", 6>,
			SqlError<"syntax error: expected column constraint at or near is", 8>,
			SqlError<'syntax error: expected "," or ")" at or near <', 10>,
			SqlError<
				"syntax error: expected column constraint at or near include",
				7
			>,
			SqlError<"syntax error: expected column constraint at or near with", 8>,
			SqlError<
				"syntax error: expected column constraint at or near storage",
				8
			>,
			SqlError<
				"syntax error: expected column constraint at or near storage",
				8
			>,
			SqlError<
				"syntax error: expected column constraint at or near compression",
				8
			>,
		]
	>();
});

test("a table's clauses after the columns come in Postgres's order, once each", () => {
	expectTypeOf<
		[
			D<"CREATE TABLE p (a int); CREATE TEMP TABLE t (b int) INHERITS (p) USING heap WITH (fillfactor = 70) ON COMMIT PRESERVE ROWS TABLESPACE pg_default">,
			D<"CREATE TEMP TABLE t (a int) PARTITION BY HASH (a) WITHOUT OIDS ON COMMIT DELETE ROWS">,
			D<"CREATE TEMP TABLE t (a int) ON COMMIT DROP">,
			D<"CREATE TABLE p (a int) PARTITION BY LIST (a); CREATE TABLE c PARTITION OF p DEFAULT USING heap WITH (fillfactor = 70) TABLESPACE pg_default">,
			D<"CREATE TABLE t USING heap WITH (fillfactor = 70) TABLESPACE pg_default AS SELECT 1 AS a">,
			D<"CREATE MATERIALIZED VIEW v USING heap WITH (fillfactor = 70) TABLESPACE pg_default AS SELECT 1 AS a">,
			D<"CREATE RECURSIVE VIEW v (n) WITH (security_barrier) AS SELECT 1">,
		]
	>().toEqualTypeOf<
		[
			{
				p: { a: Nullable<"int4"> };
				t: { a: Nullable<"int4">; b: Nullable<"int4"> };
			},
			{ t: { a: Nullable<"int4"> } },
			{ t: { a: Nullable<"int4"> } },
			{ c: { a: Nullable<"int4"> }; p: { a: Nullable<"int4"> } },
			{ t: { a: Nullable<"int4"> } },
			{ v: View<{ a: Col<"int4"> }> },
			{ v: View<{ n: Col<"int4"> }> },
		]
	>();
	expectTypeOf<
		[
			D<"CREATE TABLE t (a int) TABLESPACE pg_default WITH (fillfactor=70)">,
			D<"CREATE TABLE t (a int) WITH (fillfactor=70) USING heap">,
			D<"CREATE TABLE p1 (a int); CREATE TABLE p2 (b int); CREATE TABLE t (c int) INHERITS (p1) INHERITS (p2)">,
			D<"CREATE TABLE p1 (a int); CREATE TABLE t (c int) PARTITION BY LIST (c) INHERITS (p1)">,
			D<"CREATE TABLE t (a int) WITHOUT OIDS WITH (fillfactor=70)">,
			D<"CREATE TEMP TABLE t (a int) ON COMMIT DROP ON COMMIT DROP">,
			D<"CREATE TABLE t (a int) TABLESPACE pg_default ON COMMIT DROP">,
			D<"CREATE TABLE t (a int) PARTITION BY LIST (a) PARTITION BY LIST (a)">,
			D<"CREATE TABLE t (a int) WITHOUT foo">,
			D<"CREATE TEMP TABLE t (a int) ON COMMIT foo">,
			D<"CREATE TEMP TABLE t (a int) ON COMMIT DELETE foo">,
			D<"CREATE TABLE p (a int) PARTITION BY LIST (a); CREATE TABLE c PARTITION OF p DEFAULT INHERITS (p)">,
			D<"CREATE TABLE t TABLESPACE pg_default USING heap AS SELECT 1 AS a">,
			D<"CREATE MATERIALIZED VIEW v WITHOUT OIDS AS SELECT 1 AS a">,
			D<"CREATE MATERIALIZED VIEW v TABLESPACE pg_default WITH (fillfactor = 70) AS SELECT 1 AS a">,
			D<"CREATE RECURSIVE VIEW v (n) TABLESPACE pg_default AS SELECT 1">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error at or near with", 9>,
			SqlError<"syntax error at or near using", 13>,
			SqlError<"syntax error at or near inherits", 27>,
			SqlError<"syntax error at or near inherits", 21>,
			SqlError<"syntax error at or near with", 9>,
			SqlError<"syntax error at or near on", 11>,
			SqlError<"syntax error at or near on", 9>,
			SqlError<"syntax error at or near partition", 13>,
			SqlError<"syntax error at or near without", 7>,
			SqlError<
				"syntax error: expected DROP, DELETE ROWS or PRESERVE ROWS at or near foo",
				10
			>,
			SqlError<"syntax error: expected ROWS at or near foo", 11>,
			SqlError<"syntax error at or near inherits", 21>,
			SqlError<
				'syntax error: expected "(", AS, OF or PARTITION OF at or near using',
				5
			>,
			SqlError<"syntax error: expected AS at or near without", 4>,
			SqlError<"syntax error: expected AS at or near with", 6>,
			SqlError<"syntax error: expected AS at or near tablespace", 7>,
		]
	>();
});

test("table elements: constraints, LIKE and column definitions, and their syntax errors", () => {
	expectTypeOf<
		[
			D<"CREATE TABLE t (exclude int, a int, EXCLUDE (a WITH =))">,
			D<"CREATE TABLE t (a int, CONSTRAINT c NOT NULL a, CONSTRAINT d UNIQUE (a), CONSTRAINT e CHECK (a > 0), CONSTRAINT f EXCLUDE USING btree (a WITH =))">,
			D<"CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (a int, FOREIGN KEY (a) REFERENCES u)">,
			D<"CREATE TABLE t (a int, b int, NOT NULL a NO INHERIT, NOT NULL b NOT VALID)">,
			D<"CREATE TABLE t (a int, b int, PRIMARY KEY (a) DEFERRABLE INITIALLY DEFERRED, UNIQUE (b) NOT DEFERRABLE INITIALLY IMMEDIATE)">,
			D<"CREATE TABLE t (a int, b int, CHECK (a > 0) NOT ENFORCED, CHECK (b > 0) ENFORCED)">,
			D<'CREATE TABLE t ("a" int, "b" int NOT NULL)'>,
			D<"CREATE TABLE t ()">,
			D<"CREATE TABLE t (a int, b int, NOT NULL a NOT DEFERRABLE INITIALLY IMMEDIATE, NOT NULL b NOT VALID NO INHERIT)">,
		]
	>().toEqualTypeOf<
		[
			{ t: { a: Nullable<"int4">; exclude: Nullable<"int4"> } },
			{ t: { a: Col<"int4"> } },
			{ t: { a: Nullable<"int4"> }; u: { id: Col<"int4"> } },
			{ t: { a: Col<"int4">; b: Nullable<"int4"> } },
			{ t: { a: Col<"int4">; b: Nullable<"int4"> } },
			{ t: { a: Nullable<"int4">; b: Nullable<"int4"> } },
			{ t: { a: Nullable<"int4">; b: Col<"int4"> } },
			{ t: {} },
			{ t: { a: Col<"int4">; b: Nullable<"int4"> } },
		]
	>();
	expectTypeOf<
		[
			D<"CREATE TABLE t (a int, NOT NULL a DEFERRABLE)">,
			D<"CREATE TABLE t (a int, CONSTRAINT c foo)">,
			D<"CREATE TABLE t (a int, CONSTRAINT 1 CHECK (a > 0))">,
			D<"CREATE TABLE t (a int, PRIMARY KEY a)">,
			D<"CREATE TABLE t (a int, PRIMARY KEY (1))">,
			D<"CREATE TABLE t (a int, PRIMARY KEY (a b))">,
			D<"CREATE TABLE t (a int, PRIMARY KEY (a)">,
			D<"CREATE TABLE t (a int, NOT a)">,
			D<"CREATE TABLE t (a int, NOT NULL 1)">,
			D<"CREATE TABLE t (a int, NOT NULL a INITIALLY foo)">,
			D<"CREATE TABLE t (a int, NOT NULL a NO foo)">,
			D<"CREATE TABLE t (a int, NOT NULL a NOT foo)">,
			D<"CREATE TABLE t (a int, LIKE 1)">,
			D<"CREATE TABLE p (a int); CREATE TABLE t (LIKE p INCLUDING 1)">,
			D<"CREATE TABLE p (a int); CREATE TABLE t (LIKE p EXCLUDING 1)">,
			D<"CREATE TABLE t (1 int)">,
			D<"CREATE TABLE t (a 1)">,
			D<"CREATE TABLE t (a int b int)">,
			D<"CREATE TABLE t (a (b))">,
			D<"CREATE TABLE t (a int, NOT NULL a NO INHERIT DEFERRABLE)">,
			D<"CREATE TABLE t (a int, NOT NULL a INITIALLY DEFERRED)">,
			D<"CREATE TABLE t (a int, NOT NULL a NOT ENFORCED)">,
			D<"CREATE TABLE t (a int, NOT NULL a ENFORCED)">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ADD NOT NULL a DEFERRABLE">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"NOT NULL constraints cannot be marked DEFERRABLE", 10>,
			SqlError<"syntax error: expected table constraint at or near foo", 9>,
			SqlError<"syntax error: expected constraint name at or near 1", 8>,
			SqlError<'syntax error: expected "(" at or near a', 9>,
			SqlError<"syntax error: expected column name at or near 1", 10>,
			SqlError<'syntax error: expected "," or ")" at or near b', 11>,
			SqlError<'syntax error: expected "," or ")" at or near end of input', 12>,
			SqlError<"syntax error: expected NULL at or near a", 8>,
			SqlError<"syntax error: expected column name at or near 1", 9>,
			SqlError<'syntax error: expected "," or ")" at or near initially', 10>,
			SqlError<'syntax error: expected "," or ")" at or near no', 10>,
			SqlError<'syntax error: expected "," or ")" at or near not', 10>,
			SqlError<"syntax error: expected table name after LIKE at or near 1", 8>,
			SqlError<"syntax error: expected LIKE option at or near 1", 15>,
			SqlError<"syntax error: expected LIKE option at or near 1", 15>,
			SqlError<"syntax error: expected column name at or near 1", 4>,
			SqlError<"syntax error: expected type name at or near 1", 5>,
			SqlError<"syntax error: expected column constraint at or near b", 6>,
			SqlError<"syntax error: expected type name at or near (", 5>,
			SqlError<"NOT NULL constraints cannot be marked DEFERRABLE", 10>,
			SqlError<"NOT NULL constraints cannot be marked DEFERRABLE", 10>,
			SqlError<"NOT NULL constraints cannot be marked NOT ENFORCED", 10>,
			SqlError<"NOT NULL constraints cannot be marked ENFORCED", 10>,
			SqlError<"NOT NULL constraints cannot be marked DEFERRABLE", 15>,
		]
	>();
});

test("views: storage, column names, CHECK OPTION, and their syntax errors", () => {
	expectTypeOf<
		[
			D<"CREATE VIEW v WITH (security_barrier) AS SELECT 1 AS a">,
			D<"CREATE VIEW v (a) AS SELECT 1, 2 AS b">,
			D<"CREATE TABLE t (a int); CREATE VIEW v AS SELECT a FROM t WITH LOCAL CHECK OPTION; CREATE VIEW w AS SELECT a FROM t WITH CASCADED CHECK OPTION; CREATE VIEW x AS SELECT a FROM t WITH CHECK OPTION">,
			D<"CREATE MATERIALIZED VIEW v AS SELECT 1 AS a WITH NO DATA; CREATE MATERIALIZED VIEW w AS SELECT 1 AS a WITH DATA">,
			D<"CREATE RECURSIVE VIEW v (n) AS VALUES (1) UNION ALL SELECT n + 1 FROM v WHERE n < 5">,
			D<"CREATE RECURSIVE VIEW v (n) AS SELECT 1; CREATE OR REPLACE RECURSIVE VIEW v (n) AS SELECT 2">,
			D<"CREATE VIEW v AS SELECT 1 AS a; CREATE OR REPLACE VIEW v AS SELECT 1 AS a, 2 AS b">,
		]
	>().toEqualTypeOf<
		[
			{ v: View<{ a: Col<"int4"> }> },
			{ v: View<{ a: Col<"int4">; b: Col<"int4"> }> },
			{
				t: { a: Nullable<"int4"> };
				v: View<{ a: Nullable<"int4"> }>;
				w: View<{ a: Nullable<"int4"> }>;
				x: View<{ a: Nullable<"int4"> }>;
			},
			{ v: View<{ a: Col<"int4"> }>; w: View<{ a: Col<"int4"> }> },
			{ v: View<{ n: Col<"int4"> }> },
			{ v: View<{ n: Col<"int4"> }> },
			{ v: View<{ a: Col<"int4">; b: Col<"int4"> }> },
		]
	>();
	expectTypeOf<
		[
			D<"CREATE VIEW v WITH x AS SELECT 1">,
			D<"CREATE VIEW v SELECT 1">,
			D<"CREATE VIEW v (a, 1) AS SELECT 1">,
			D<"CREATE VIEW 1 AS SELECT 1">,
			D<"CREATE VIEW v AS SELECT x">,
			D<"CREATE TABLE t (a int); CREATE VIEW v AS SELECT a FROM t WITH CHECK foo">,
			D<"CREATE TABLE t (a int); CREATE VIEW v AS SELECT a FROM t WITH foo">,
			D<"CREATE TABLE t (a int); CREATE VIEW v AS SELECT a FROM t WITH LOCAL foo">,
			D<"CREATE MATERIALIZED VIEW v WITH x AS SELECT 1">,
			D<"CREATE MATERIALIZED VIEW v AS SELECT 1 AS a WITH foo">,
			D<"CREATE RECURSIVE VIEW v AS SELECT 1">,
			D<"CREATE RECURSIVE VIEW 1 (n) AS SELECT 1">,
			D<"CREATE RECURSIVE VIEW v (n) SELECT 1">,
			D<"CREATE RECURSIVE VIEW v (n) WITH x AS SELECT 1">,
			D<"CREATE RECURSIVE VIEW v (n) AS SELECT x">,
			D<"CREATE RECURSIVE VIEW v (n) AS SELECT 1 WITH foo">,
			D<"CREATE VIEW v AS SELECT 1 AS a; CREATE VIEW v AS SELECT 1 AS a">,
			D<"CREATE MATERIALIZED VIEW v (a, 1) AS SELECT 1">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error at or near x", 4>,
			SqlError<"syntax error: expected AS at or near select", 3>,
			SqlError<"syntax error: expected identifier at or near 1", 6>,
			SqlError<"syntax error: expected view name at or near 1", 2>,
			SqlError<'column "x" does not exist', 5>,
			SqlError<"syntax error at or near with", 16>,
			SqlError<"syntax error at or near with", 16>,
			SqlError<"syntax error at or near with", 16>,
			SqlError<"syntax error at or near x", 5>,
			SqlError<"syntax error at or near with", 9>,
			SqlError<'syntax error: expected "(" at or near as', 4>,
			SqlError<"syntax error: expected view name at or near 1", 3>,
			SqlError<"syntax error: expected AS at or near select", 7>,
			SqlError<"syntax error at or near x", 8>,
			SqlError<'column "x" does not exist', 9>,
			SqlError<"syntax error at or near with", 10>,
			SqlError<'relation "v" already exists', 11>,
			SqlError<"syntax error: expected identifier at or near 1", 7>,
		]
	>();
});

test("CREATE TYPE and CREATE SCHEMA with elements: their syntax errors", () => {
	expectTypeOf<
		[
			D<"CREATE TYPE e AS ENUM ()">,
			D<"CREATE TYPE e AS ENUM ('a')">,
			D<"CREATE TYPE e AS ENUM ('a', 'b', 'c')">,
			D<"CREATE TYPE c AS (a int, b text); CREATE TYPE r AS RANGE (subtype = int4); CREATE TYPE sh; CREATE TABLE x (b int)">,
			D<"CREATE SCHEMA AUTHORIZATION CURRENT_ROLE CREATE TABLE t (x int)">,
			D<"CREATE SCHEMA AUTHORIZATION CURRENT_USER">,
			D<"CREATE SCHEMA s CREATE TABLE t (x int) CREATE TABLE s.u (y int)">,
			D<"CREATE SCHEMA s CREATE TABLE s.t (x int) CREATE VIEW s.v AS SELECT x FROM t">,
			D<"CREATE SCHEMA s CREATE VIEW v AS SELECT x FROM t CREATE TABLE t (x int) CREATE VIEW w AS SELECT x FROM v">,
			D<"CREATE SCHEMA s CREATE OR REPLACE VIEW v AS SELECT 1 AS a">,
			D<"CREATE SCHEMA s CREATE RECURSIVE VIEW v (n) AS SELECT 1">,
			D<"CREATE SCHEMA s CREATE UNLOGGED TABLE t (x int)">,
			D<"CREATE SCHEMA s CREATE SEQUENCE IF NOT EXISTS s.q">,
			D<"CREATE SCHEMA s CREATE TABLE t (x int) CREATE INDEX i ON ONLY s.t (x) CREATE UNIQUE INDEX ON t (x)">,
			D<"CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; CREATE SCHEMA s CREATE TABLE t (x int) CREATE TRIGGER tr BEFORE INSERT ON s.t FOR EACH ROW EXECUTE FUNCTION f()">,
			D<"CREATE SCHEMA s CREATE TABLE t (x int) GRANT SELECT ON t TO public CREATE TABLE u (y int)">,
			D<"CREATE SCHEMA s CREATE TABLE t (x int) GRANT CREATE, USAGE ON SCHEMA s TO public CREATE TABLE u (y int)">,
			D<"CREATE SCHEMA s CREATE TABLE t (x int CHECK ((x) > 0)) CREATE TABLE u (y int); CREATE TABLE v (z int)">,
			D<"CREATE SCHEMA s CREATE TABLE t (x int) CREATE INDEX ON t ((x + 1)); CREATE TABLE v (z int)">,
			D<"CREATE SCHEMA s CREATE TABLE t (x int) CREATE INDEX ON t (x) WHERE (x > (1)) CREATE TABLE u (y int)">,
			D<"CREATE SCHEMA s CREATE TABLE t (x int) CREATE INDEX ON t (x) CREATE TABLE u (y int)">,
			D<"CREATE SCHEMA s CREATE SEQUENCE q CREATE TABLE u (y int)">,
		]
	>().toEqualTypeOf<
		[
			{ $types: { e: never } },
			{ $types: { e: "a" } },
			{ $types: { e: "a" | "b" | "c" } },
			{ x: { b: Nullable<"int4"> } },
			{ current_role: { t: { x: Nullable<"int4"> } } },
			{ current_user: {} },
			{ s: { t: { x: Nullable<"int4"> }; u: { y: Nullable<"int4"> } } },
			{ s: { t: { x: Nullable<"int4"> }; v: View<{ x: Nullable<"int4"> }> } },
			{
				s: {
					t: { x: Nullable<"int4"> };
					v: View<{ x: Nullable<"int4"> }>;
					w: View<{ x: Nullable<"int4"> }>;
				};
			},
			{ s: { v: View<{ a: Col<"int4"> }> } },
			{ s: { v: View<{ n: Col<"int4"> }> } },
			{ s: { t: { x: Nullable<"int4"> } } },
			{ s: {} },
			{ s: { t: { x: Nullable<"int4"> } } },
			{
				$functions: { f: { readonly args: ["..."]; readonly ret: "trigger" } };
				s: { t: { x: Nullable<"int4"> } };
			},
			{ s: { t: { x: Nullable<"int4"> }; u: { y: Nullable<"int4"> } } },
			{ s: { t: { x: Nullable<"int4"> }; u: { y: Nullable<"int4"> } } },
			{
				s: { t: { x: Nullable<"int4"> }; u: { y: Nullable<"int4"> } };
				v: { z: Nullable<"int4"> };
			},
			{ s: { t: { x: Nullable<"int4"> } }; v: { z: Nullable<"int4"> } },
			{ s: { t: { x: Nullable<"int4"> }; u: { y: Nullable<"int4"> } } },
			{ s: { t: { x: Nullable<"int4"> }; u: { y: Nullable<"int4"> } } },
			{ s: { u: { y: Nullable<"int4"> } } },
		]
	>();
	expectTypeOf<
		[
			D<"CREATE TYPE e AS ENUM 'a'">,
			D<"CREATE TYPE e AS ENUM ('a' 'b')">,
			D<"CREATE TYPE e AS ENUM ('a', 1)">,
			D<"CREATE TYPE e AS ENUM (">,
			D<"CREATE TYPE 1 AS ENUM ('a')">,
			D<"CREATE SCHEMA AUTHORIZATION 1">,
			D<"CREATE SCHEMA s AUTHORIZATION 1">,
			D<"CREATE SCHEMA 1">,
			D<"CREATE SCHEMA s CREATE OR VIEW v AS SELECT 1 AS a">,
			D<"CREATE SCHEMA s CREATE RECURSIVE TABLE t (x int)">,
			D<"CREATE SCHEMA s CREATE TEMP TABLE t (x int)">,
			D<"CREATE SCHEMA s CREATE TEMPORARY TABLE t (x int)">,
			D<"CREATE SCHEMA s CREATE LOCAL TEMP TABLE t (x int)">,
			D<"CREATE SCHEMA s CREATE GLOBAL TEMP TABLE t (x int)">,
			D<"CREATE SCHEMA s CREATE FUNCTION f() RETURNS int RETURN 1">,
			D<"CREATE SCHEMA s CREATE 1">,
			D<"CREATE SCHEMA s CREATE SEQUENCE other.q">,
			D<"CREATE SCHEMA s CREATE SEQUENCE 1">,
			D<"CREATE SCHEMA s CREATE TABLE t (x int) CREATE INDEX i ON other.t (x)">,
			D<"CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; CREATE SCHEMA s CREATE TABLE t (x int) CREATE TRIGGER tr BEFORE INSERT ON other.t FOR EACH ROW EXECUTE FUNCTION f()">,
			D<"CREATE SCHEMA s CREATE TABLE t AS SELECT 1">,
			D<"CREATE SCHEMA s CREATE TABLE other.t (x int)">,
			D<"CREATE SCHEMA s CREATE VIEW other.v AS SELECT 1 AS a">,
			D<"CREATE SCHEMA s CREATE RECURSIVE VIEW other.v (n) AS SELECT 1">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error: expected \"(\" at or near 'a'", 5>,
			SqlError<'syntax error: expected "," or ")" at or near \'b\'', 7>,
			SqlError<"syntax error: expected enum label at or near 1", 8>,
			SqlError<"syntax error: expected enum label at or near end of input", 6>,
			SqlError<"syntax error: expected type name at or near 1", 2>,
			SqlError<"syntax error: expected role name at or near 1", 3>,
			SqlError<"syntax error: expected role name at or near 1", 4>,
			SqlError<"syntax error: expected schema name at or near 1", 2>,
			SqlError<"syntax error: expected REPLACE at or near view", 5>,
			SqlError<"syntax error: expected VIEW at or near table", 5>,
			SqlError<"cannot create temporary relation in non-temporary schema", 5>,
			SqlError<"cannot create temporary relation in non-temporary schema", 5>,
			SqlError<"cannot create temporary relation in non-temporary schema", 6>,
			SqlError<"cannot create temporary relation in non-temporary schema", 6>,
			SqlError<
				"syntax error: expected TABLE, VIEW, INDEX, SEQUENCE or TRIGGER at or near function",
				4
			>,
			SqlError<
				"syntax error: expected TABLE, VIEW, INDEX, SEQUENCE or TRIGGER at or near 1",
				4
			>,
			SqlError<
				"CREATE specifies a schema (other) different from the one being created (s)",
				5
			>,
			SqlError<"syntax error: expected sequence name at or near 1", 5>,
			SqlError<
				"CREATE specifies a schema (other) different from the one being created (s)",
				14
			>,
			SqlError<
				"CREATE specifies a schema (other) different from the one being created (s)",
				28
			>,
			SqlError<"syntax error at or near table", 4>,
			SqlError<
				"CREATE specifies a schema (other) different from the one being created (s)",
				5
			>,
			SqlError<
				"CREATE specifies a schema (other) different from the one being created (s)",
				5
			>,
			SqlError<
				"CREATE specifies a schema (other) different from the one being created (s)",
				6
			>,
		]
	>();
});

test("ALTER TABLE actions and their syntax errors", () => {
	expectTypeOf<
		[
			D<"CREATE TABLE t (a int); ALTER TABLE t * ADD COLUMN c int; ALTER TABLE ONLY t ADD COLUMN d int">,
			D<"CREATE TABLE t (a int, b int); CREATE INDEX i ON t (a); ALTER TABLE t OWNER TO CURRENT_USER, ENABLE TRIGGER ALL, DISABLE TRIGGER ALL, ADD CONSTRAINT c CHECK (a > 0) NOT VALID, VALIDATE CONSTRAINT c, CLUSTER ON i, REPLICA IDENTITY FULL, FORCE ROW LEVEL SECURITY, RESET (fillfactor), SET UNLOGGED, ADD COLUMN x int">,
			D<"CREATE TABLE p (a int); CREATE TABLE t (a int); ALTER TABLE t INHERIT p, NO INHERIT p, ADD COLUMN x int">,
			D<"CREATE TYPE ty AS (a int, b int); CREATE TABLE t (a int, b int); ALTER TABLE t OF ty, REPLICA IDENTITY FULL; ALTER TABLE t NOT OF, REPLICA IDENTITY DEFAULT">,
			D<"CREATE TABLE p (a int) PARTITION BY LIST (a); CREATE TABLE c (a int); ALTER TABLE p ATTACH PARTITION c DEFAULT; ALTER TABLE p DETACH PARTITION c">,
			D<"CREATE FOREIGN DATA WRAPPER w; CREATE SERVER s FOREIGN DATA WRAPPER w; CREATE FOREIGN TABLE ft (a int) SERVER s; ALTER TABLE IF EXISTS ft OPTIONS (ADD x 'y')">,
			D<"CREATE TABLE t (a int, b int); CREATE UNIQUE INDEX i ON t (a); ALTER TABLE t ADD UNIQUE (a), ADD CHECK (a > 0), ADD CONSTRAINT c UNIQUE (b), ADD EXCLUDE (a WITH =), ADD CONSTRAINT pk PRIMARY KEY USING INDEX i">,
			D<"CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (a int); ALTER TABLE t ADD FOREIGN KEY (a) REFERENCES u">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ADD CONSTRAINT c NOT NULL a NOT VALID, ADD COLUMN x int">,
			D<"CREATE TABLE t (a int, CONSTRAINT c CHECK (a > 0)); ALTER TABLE t DROP CONSTRAINT c, ADD COLUMN x int">,
			D<"CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (a int, CONSTRAINT c FOREIGN KEY (a) REFERENCES u); ALTER TABLE t ALTER CONSTRAINT c DEFERRABLE, ADD COLUMN x int">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ALTER COLUMN a SET DATA TYPE bigint">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ALTER COLUMN a SET STATISTICS 100, ADD COLUMN x int">,
			D<"CREATE TABLE t (a int GENERATED ALWAYS AS IDENTITY, b int); ALTER TABLE t ALTER COLUMN a RESTART, ALTER COLUMN b RESET (n_distinct), ADD COLUMN x int">,
			D<'CREATE TABLE t (a int); ALTER TABLE t ALTER a TYPE text COLLATE "C" USING a::text'>,
			D<"CREATE TEMP TABLE t ON COMMIT DROP AS SELECT 1 AS a">,
			D<"CREATE TABLE t WITHOUT OIDS AS SELECT 1 AS a">,
		]
	>().toEqualTypeOf<
		[
			{ t: { a: Nullable<"int4">; c: Nullable<"int4">; d: Nullable<"int4"> } },
			{ t: { a: Nullable<"int4">; b: Nullable<"int4">; x: Nullable<"int4"> } },
			{
				p: { a: Nullable<"int4"> };
				t: { a: Nullable<"int4">; x: Nullable<"int4"> };
			},
			{ t: { a: Nullable<"int4">; b: Nullable<"int4"> } },
			{ c: { a: Nullable<"int4"> }; p: { a: Nullable<"int4"> } },
			{},
			{ t: { a: Nullable<"int4">; b: Nullable<"int4"> } },
			{ t: { a: Nullable<"int4"> }; u: { id: Col<"int4"> } },
			{ t: { a: Nullable<"int4">; x: Nullable<"int4"> } },
			{ t: { a: Nullable<"int4">; x: Nullable<"int4"> } },
			{
				t: { a: Nullable<"int4">; x: Nullable<"int4"> };
				u: { id: Col<"int4"> };
			},
			{ t: { a: Nullable<"int8"> } },
			{ t: { a: Nullable<"int4">; x: Nullable<"int4"> } },
			{ t: { a: Generated<"int4">; b: Nullable<"int4">; x: Nullable<"int4"> } },
			{ t: { a: Nullable<"text"> } },
			{ t: { a: Nullable<"int4"> } },
			{ t: { a: Nullable<"int4"> } },
		]
	>();
	expectTypeOf<
		[
			D<"CREATE TABLE t (a int); ALTER TABLE ALL foo">,
			D<"ALTER TABLE 1 ADD COLUMN c int">,
			D<"CREATE TABLE t (a int); ALTER TABLE t SET SCHEMA 1">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ADD CONSTRAINT 1 CHECK (a > 0)">,
			D<"CREATE TABLE t (a int); ALTER TABLE t DROP 1">,
			D<"CREATE TABLE t (a int); ALTER TABLE t RENAME TO 1">,
			D<"CREATE TABLE t (a int); ALTER TABLE t RENAME CONSTRAINT 1 TO b">,
			D<"CREATE TABLE t (a int, CONSTRAINT c CHECK (a > 0)); ALTER TABLE t RENAME CONSTRAINT c d">,
			D<"CREATE TABLE t (a int, CONSTRAINT c CHECK (a > 0)); ALTER TABLE t RENAME CONSTRAINT c TO 1">,
			D<"CREATE TABLE t (a int); ALTER TABLE t RENAME COLUMN a b">,
			D<"CREATE TABLE t (a int); ALTER TABLE t RENAME a TO 1">,
			D<"CREATE TABLE t (a int); ALTER TABLE t RENAME 1 TO b">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ALTER COLUMN a SET DATA x">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ALTER COLUMN a SET NOT x">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ALTER COLUMN a SET DEFAULT )">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ALTER COLUMN a DROP NOT x">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ALTER COLUMN a DROP foo">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ALTER COLUMN a ADD foo">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ALTER COLUMN a ADD GENERATED ALWAYS AS (1)">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ALTER COLUMN a ADD GENERATED x">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ALTER COLUMN a FOO">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ALTER COLUMN a 1">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ALTER COLUMN 1 SET NOT NULL">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ALTER a TYPE 1">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ALTER a TYPE int USING )">,
			D<"CREATE TABLE t (a text); ALTER TABLE t ALTER a TYPE text COLLATE 1">,
			D<"CREATE TABLE t (a int); ALTER TABLE t FOO">,
			D<"CREATE TABLE t (a int); ALTER TABLE t 1">,
			D<"CREATE TABLE t (a int); ALTER TABLE t SET WITH (fillfactor = 70)">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error: expected IN TABLESPACE at or near foo", 11>,
			SqlError<"syntax error: expected table name at or near 1", 2>,
			SqlError<"syntax error: expected schema name at or near 1", 13>,
			SqlError<"syntax error: expected constraint name at or near 1", 13>,
			SqlError<"syntax error: expected column name at or near 1", 12>,
			SqlError<"syntax error: expected new name at or near 1", 13>,
			SqlError<"syntax error: expected constraint name at or near 1", 13>,
			SqlError<"syntax error: expected TO at or near d", 23>,
			SqlError<"syntax error: expected new constraint name at or near 1", 24>,
			SqlError<"syntax error: expected TO at or near b", 14>,
			SqlError<"syntax error: expected new column name at or near 1", 14>,
			SqlError<"syntax error: expected column name at or near 1", 12>,
			SqlError<"syntax error: expected TYPE at or near x", 16>,
			SqlError<"syntax error: expected NULL at or near x", 16>,
			SqlError<"syntax error at or near )", 16>,
			SqlError<"syntax error: expected NULL at or near x", 16>,
			SqlError<
				"syntax error: expected NOT NULL, DEFAULT, IDENTITY or EXPRESSION at or near foo",
				15
			>,
			SqlError<"syntax error: expected GENERATED at or near foo", 15>,
			SqlError<"syntax error: expected IDENTITY at or near end of input", 21>,
			SqlError<"syntax error: expected ALWAYS or BY DEFAULT at or near x", 16>,
			SqlError<"syntax error: expected ALTER COLUMN action at or near foo", 14>,
			SqlError<"syntax error: expected ALTER COLUMN action at or near 1", 14>,
			SqlError<"syntax error: expected column name at or near 1", 13>,
			SqlError<"syntax error: expected type name at or near 1", 14>,
			SqlError<"syntax error at or near )", 16>,
			SqlError<"syntax error at or near 1", 16>,
			SqlError<"syntax error: expected ALTER TABLE action at or near foo", 11>,
			SqlError<"syntax error: expected ALTER TABLE action at or near 1", 11>,
			SqlError<"syntax error at or near with", 12>,
		]
	>();
});

test("ALTER TYPE / SCHEMA / MATERIALIZED VIEW, DROP: their syntax errors", () => {
	expectTypeOf<
		[
			D<"CREATE TYPE e AS ENUM ('a', 'c'); ALTER TYPE e ADD VALUE 'b' BEFORE 'c'; ALTER TYPE e ADD VALUE IF NOT EXISTS 'd' AFTER 'c'; ALTER TYPE e ADD VALUE IF NOT EXISTS 'a'">,
			D<"CREATE TYPE e AS ENUM ('a'); ALTER TYPE e RENAME VALUE 'a' TO 'z'; ALTER TYPE e RENAME TO f; ALTER TYPE f OWNER TO CURRENT_USER; ALTER TYPE f SET SCHEMA public">,
			D<"CREATE SCHEMA s; ALTER SCHEMA s OWNER TO CURRENT_USER">,
			D<"CREATE MATERIALIZED VIEW v AS SELECT 1 AS a; ALTER MATERIALIZED VIEW v RENAME COLUMN a TO b">,
			D<"CREATE TYPE e AS ENUM ('a'); CREATE TYPE f AS ENUM ('b'); DROP TYPE e, f">,
			D<"CREATE SCHEMA s; CREATE SCHEMA r; DROP SCHEMA s, r">,
			D<"CREATE TABLE t (a int); DROP TABLE t RESTRICT">,
			D<"CREATE VIEW v AS SELECT 1 AS a; DROP VIEW v">,
			D<"CREATE MATERIALIZED VIEW v AS SELECT 1 AS a; DROP MATERIALIZED VIEW v">,
			D<"CREATE TYPE e AS ENUM ('a'); ALTER TYPE e OWNER TO CURRENT_USER; ALTER TYPE e SET SCHEMA public">,
		]
	>().toEqualTypeOf<
		[
			{ $types: { e: "a" | "b" | "c" | "d" } },
			{ $types: { f: "z" } },
			{ s: {} },
			{ v: View<{ b: Col<"int4"> }> },
			{ $types: {} },
			{},
			{},
			{},
			{},
			{ $types: { e: "a" } },
		]
	>();
	expectTypeOf<
		[
			D<"CREATE TYPE e AS ENUM ('a'); ALTER TYPE e ADD VALUE 1">,
			D<"CREATE TYPE e AS ENUM ('a'); ALTER TYPE e ADD VALUE 'b' BEFORE 1">,
			D<"CREATE TYPE e AS ENUM ('a'); ALTER TYPE e RENAME VALUE 1 TO 'b'">,
			D<"CREATE TYPE e AS ENUM ('a'); ALTER TYPE e RENAME VALUE 'a' 'b'">,
			D<"CREATE TYPE e AS ENUM ('a'); ALTER TYPE e RENAME VALUE 'a' TO 1">,
			D<"CREATE TYPE e AS ENUM ('a'); ALTER TYPE e RENAME TO 1">,
			D<"CREATE TYPE e AS ENUM ('a'); ALTER TYPE e FOO">,
			D<"ALTER TYPE 1 RENAME TO f">,
			D<"CREATE SCHEMA s; ALTER SCHEMA s RENAME TO 1">,
			D<"ALTER SCHEMA 1 RENAME TO s">,
			D<"ALTER MATERIALIZED TABLE t RENAME TO u">,
			D<"ALTER FOO x">,
			D<"ALTER 1">,
			D<"DROP MATERIALIZED TABLE t">,
			D<"DROP FOO x">,
			D<"DROP 1">,
			D<"CREATE TABLE t (a int); DROP TABLE t FOO">,
			D<"DROP MATERIALIZED VIEW nope">,
			D<"DROP VIEW nope">,
			D<"ALTER TYPE nope ADD ATTRIBUTE b int">,
			D<"ALTER TYPE nope RENAME ATTRIBUTE a TO b">,
			D<"ALTER TYPE nope DROP ATTRIBUTE a">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error: expected enum label at or near 1", 14>,
			SqlError<"syntax error at or near before", 15>,
			SqlError<"syntax error: expected enum label at or near 1", 14>,
			SqlError<"syntax error: expected TO at or near 'b'", 15>,
			SqlError<"syntax error: expected enum label at or near 1", 16>,
			SqlError<"syntax error: expected new type name at or near 1", 14>,
			SqlError<"syntax error: expected ALTER TYPE action at or near foo", 12>,
			SqlError<"syntax error: expected type name at or near 1", 2>,
			SqlError<"syntax error: expected new schema name at or near 1", 9>,
			SqlError<"syntax error: expected schema name at or near 1", 2>,
			SqlError<"syntax error: expected VIEW at or near table", 2>,
			SqlError<
				"syntax error: expected TABLE, VIEW, TYPE, SCHEMA, ... after ALTER at or near foo",
				1
			>,
			SqlError<
				"syntax error: expected object type after ALTER at or near 1",
				1
			>,
			SqlError<"syntax error: expected VIEW at or near table", 2>,
			SqlError<
				"syntax error: expected TABLE, VIEW, TYPE, SCHEMA, INDEX, ... after DROP at or near foo",
				1
			>,
			SqlError<"syntax error: expected object type after DROP at or near 1", 1>,
			SqlError<"syntax error at or near foo", 11>,
			SqlError<'materialized view "nope" does not exist', 3>,
			SqlError<'view "nope" does not exist', 2>,
			SqlError<'type "nope" does not exist', 2>,
			SqlError<'type "nope" does not exist', 2>,
			SqlError<'type "nope" does not exist', 2>,
		]
	>();
});

test("LIKE options, b_expr defaults, partition strategies", () => {
	expectTypeOf<
		[
			D<"CREATE TABLE p (a int GENERATED ALWAYS AS IDENTITY); CREATE TABLE t (LIKE p INCLUDING IDENTITY); CREATE TABLE u (LIKE p INCLUDING COMMENTS); CREATE TABLE v (LIKE p INCLUDING ALL EXCLUDING COMMENTS)">,
			D<"CREATE TABLE p (a int, b int GENERATED ALWAYS AS (a + 1) STORED); CREATE TABLE t (LIKE p INCLUDING GENERATED)">,
			D<"CREATE TABLE t (a bool DEFAULT 1 = 1, b bool DEFAULT 1 < 2, c bool DEFAULT 1 > 2, d bool DEFAULT 1 <= 2, e bool DEFAULT 1 >= 2, f bool DEFAULT 1 <> 2, g bool DEFAULT 1 != 2)">,
		]
	>().toEqualTypeOf<
		[
			{
				p: { a: Generated<"int4"> };
				t: { a: Generated<"int4"> };
				u: { a: Col<"int4"> };
				v: { a: Generated<"int4"> };
			},
			{
				p: { a: Nullable<"int4">; b: NullableGenerated<"int4"> };
				t: { a: Nullable<"int4">; b: NullableGenerated<"int4"> };
			},
			{
				t: {
					a: NullableGenerated<"bool">;
					b: NullableGenerated<"bool">;
					c: NullableGenerated<"bool">;
					d: NullableGenerated<"bool">;
					e: NullableGenerated<"bool">;
					f: NullableGenerated<"bool">;
					g: NullableGenerated<"bool">;
				};
			},
		]
	>();
	expectTypeOf<
		[
			D<"CREATE TABLE t (a int) PARTITION BY 1">,
			D<"CREATE MATERIALIZED VIEW v ON COMMIT DROP AS SELECT 1 AS a">,
			D<"CREATE TABLE t (a int, NOT NULL a foo VALID)">,
			D<"CREATE TABLE t (a int, NOT NULL a foo)">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error: expected RANGE, LIST or HASH at or near 1", 9>,
			SqlError<"syntax error: expected AS at or near on", 4>,
			SqlError<'syntax error: expected "," or ")" at or near foo', 10>,
			SqlError<'syntax error: expected "," or ")" at or near foo', 10>,
		]
	>();
});

test("every ALTER and DROP without schema effect", () => {
	expectTypeOf<
		[
			K<`CREATE TABLE t (a int, b int);
        CREATE SEQUENCE sq;
        CREATE INDEX i ON t (a);
        CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW;
        END $$;
        CREATE PROCEDURE p() LANGUAGE sql AS 'SELECT 1';
        CREATE FUNCTION g() RETURNS int LANGUAGE sql RETURN 1;
        CREATE TRIGGER tr BEFORE INSERT ON t FOR EACH ROW EXECUTE FUNCTION f();
        CREATE POLICY po ON t USING (true);
        CREATE RULE r AS ON INSERT TO t DO NOTHING;
        CREATE DOMAIN d AS int;
        CREATE AGGREGATE agg (int) (SFUNC = int4pl, STYPE = int);
        CREATE OPERATOR === (FUNCTION = int4eq, LEFTARG = int, RIGHTARG = int);
        CREATE ROLE r1;
        CREATE USER u1;
        CREATE GROUP g1;
        CREATE COLLATION c1 FROM "C";
        ALTER SEQUENCE sq RESTART;
        ALTER INDEX i RENAME TO i2;
        ALTER FUNCTION g() IMMUTABLE;
        ALTER PROCEDURE p() RENAME TO p2;
        ALTER ROUTINE g() STABLE;
        ALTER TRIGGER tr ON t RENAME TO tr2;
        ALTER EXTENSION plpgsql UPDATE;
        ALTER POLICY po ON t RENAME TO po2;
        ALTER RULE r ON t RENAME TO r2;
        ALTER DOMAIN d SET NOT NULL;
        ALTER AGGREGATE agg(int) RENAME TO agg2;
        ALTER OPERATOR === (int, int) OWNER TO CURRENT_USER;
        ALTER ROLE r1 NOLOGIN;
        ALTER USER u1 NOLOGIN;
        ALTER GROUP g1 RENAME TO g2;
        ALTER COLLATION c1 RENAME TO c2;
        CREATE TABLE x (b int)`>,
			K<`CREATE FUNCTION ef() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN END $$;
        CREATE EVENT TRIGGER et ON ddl_command_start EXECUTE FUNCTION ef();
        CREATE PUBLICATION pub;
        CREATE SUBSCRIPTION sub CONNECTION 'dbname=x' PUBLICATION pub WITH (connect = false);
        CREATE FOREIGN DATA WRAPPER w;
        CREATE SERVER srv FOREIGN DATA WRAPPER w;
        CREATE TABLE t (a int, b int);
        CREATE STATISTICS st ON a, b FROM t;
        CREATE TEXT SEARCH CONFIGURATION cfg (COPY = english);
        CREATE LANGUAGE plx HANDLER plpgsql_call_handler;
        CREATE CONVERSION cv FOR 'UTF8' TO 'LATIN1' FROM utf8_to_iso8859_1;
        ALTER EVENT TRIGGER et DISABLE;
        ALTER PUBLICATION pub RENAME TO pub2;
        ALTER SUBSCRIPTION sub DISABLE;
        ALTER SERVER srv OPTIONS (ADD host 'x');
        ALTER STATISTICS st RENAME TO st2;
        ALTER TEXT SEARCH CONFIGURATION cfg RENAME TO cfg2;
        ALTER FOREIGN DATA WRAPPER w NO VALIDATOR;
        ALTER LANGUAGE plx RENAME TO plx2;
        ALTER CONVERSION cv RENAME TO cv2;
        ALTER TABLESPACE pg_default SET (seq_page_cost = 1);
        ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO public;
        CREATE TABLE x (b int)`>,
			K<`CREATE TABLE t (a int, b int);
        CREATE SEQUENCE sq;
        CREATE INDEX i ON t (a);
        CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW;
        END $$;
        CREATE PROCEDURE p() LANGUAGE sql AS 'SELECT 1';
        CREATE FUNCTION g() RETURNS int LANGUAGE sql RETURN 1;
        CREATE TRIGGER tr BEFORE INSERT ON t FOR EACH ROW EXECUTE FUNCTION f();
        CREATE POLICY po ON t USING (true);
        CREATE RULE r AS ON INSERT TO t DO NOTHING;
        CREATE DOMAIN d AS int;
        CREATE AGGREGATE agg (int) (SFUNC = int4pl, STYPE = int);
        CREATE OPERATOR === (FUNCTION = int4eq, LEFTARG = int, RIGHTARG = int);
        CREATE ROLE r1;
        CREATE USER u1;
        CREATE GROUP g1;
        CREATE COLLATION c1 FROM "C";
        CREATE CAST (d AS point) WITH INOUT;
        CREATE STATISTICS st ON a, b FROM t;
        DROP STATISTICS st;
        DROP CAST (d AS point);
        DROP INDEX i;
        DROP TRIGGER tr ON t;
        DROP FUNCTION f();
        DROP PROCEDURE p();
        DROP ROUTINE g();
        DROP EXTENSION IF EXISTS nope;
        DROP SEQUENCE sq;
        DROP POLICY po ON t;
        DROP RULE r ON t;
        DROP DOMAIN d;
        DROP AGGREGATE agg(int);
        DROP OPERATOR === (int, int);
        DROP OWNED BY r1;
        DROP ROLE r1;
        DROP USER u1;
        DROP GROUP g1;
        DROP COLLATION c1;
        CREATE TABLE x (b int)`>,
			K<`CREATE FUNCTION ef() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN END $$;
        CREATE EVENT TRIGGER et ON ddl_command_start EXECUTE FUNCTION ef();
        CREATE PUBLICATION pub;
        CREATE SUBSCRIPTION sub CONNECTION 'dbname=x' PUBLICATION pub WITH (connect = false);
        CREATE FOREIGN DATA WRAPPER w;
        CREATE SERVER srv FOREIGN DATA WRAPPER w;
        CREATE TEXT SEARCH CONFIGURATION cfg (COPY = english);
        CREATE LANGUAGE plx HANDLER plpgsql_call_handler;
        CREATE CONVERSION cv FOR 'UTF8' TO 'LATIN1' FROM utf8_to_iso8859_1;
        CREATE ACCESS METHOD am TYPE INDEX HANDLER bthandler;
        CREATE TRANSFORM FOR int LANGUAGE sql (FROM SQL WITH FUNCTION brin_minmax_opcinfo(internal), TO SQL WITH FUNCTION int4recv(internal));
        DROP EVENT TRIGGER et;
        DROP PUBLICATION pub;
        ALTER SUBSCRIPTION sub SET (slot_name = NONE);
        DROP SUBSCRIPTION sub;
        DROP SERVER srv;
        DROP FOREIGN DATA WRAPPER w;
        DROP TEXT SEARCH CONFIGURATION cfg;
        DROP LANGUAGE plx;
        DROP CONVERSION cv;
        DROP ACCESS METHOD am;
        DROP TRANSFORM FOR int LANGUAGE sql;
        CREATE TABLE x (b int)`>,
		]
	>().toEqualTypeOf<
		[
			"$functions" | "t" | "x",
			"$functions" | "t" | "x",
			"$functions" | "t" | "x",
			"$functions" | "x",
		]
	>();
	// not run in a transaction block, or about objects outside a schema: checked as statements
	expectTypeOf<
		[
			Validate<{}, "ALTER DATABASE d SET work_mem = '4MB'">,
			Validate<{}, "ALTER SYSTEM SET work_mem = '4MB'">,
			Validate<{}, "ALTER LARGE OBJECT 1 OWNER TO CURRENT_USER">,
			Validate<{}, "DROP DATABASE d">,
			Validate<{}, "DROP TABLESPACE ts">,
		]
	>().toEqualTypeOf<
		[
			"ALTER DATABASE d SET work_mem = '4MB'",
			"ALTER SYSTEM SET work_mem = '4MB'",
			"ALTER LARGE OBJECT 1 OWNER TO CURRENT_USER",
			"DROP DATABASE d",
			"DROP TABLESPACE ts",
		]
	>();
});

test("more syntax errors: a trailing comma, CHECK OPTION on a recursive view, constraints after a default or a reference", () => {
	expectTypeOf<
		[
			D<"CREATE TYPE e AS ENUM ('a',)">,
			D<"CREATE RECURSIVE VIEW v (n) AS SELECT 1 WITH LOCAL CHECK OPTION">,
			D<"CREATE TABLE t (a bool DEFAULT 1 NOT DISTINCT FROM 2)">,
			D<"CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (a int REFERENCES u x DELETE CASCADE)">,
			D<"CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (a int REFERENCES u ON x CASCADE)">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error: expected enum label at or near )", 8>,
			SqlError<"WITH CHECK OPTION not supported on recursive views", 10>,
			SqlError<"syntax error: expected NULL at or near distinct", 9>,
			SqlError<"syntax error: expected column constraint at or near x", 18>,
			SqlError<"syntax error: expected column constraint at or near on", 18>,
		]
	>();
});

test("views and schema elements: more syntax errors, the schema of CURRENT_USER, privileges named CREATE", () => {
	expectTypeOf<
		[
			// the schema is named after the role, unknown here (the oracle's server runs as postgres)
			D<"CREATE SCHEMA AUTHORIZATION CURRENT_USER CREATE TABLE postgres.t (x int)">,
			D<"CREATE SCHEMA AUTHORIZATION CURRENT_ROLE CREATE TABLE postgres.t (x int)">,
			D<"CREATE SCHEMA AUTHORIZATION SESSION_USER CREATE TABLE postgres.t (x int)">,
			D<"CREATE SCHEMA s CREATE VIEW v AS SELECT 1 AS a CREATE OR REPLACE VIEW v AS SELECT 1 AS a, 2 AS b">,
			D<"CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; CREATE SCHEMA s CREATE TABLE t (x int) CREATE CONSTRAINT TRIGGER tr AFTER INSERT ON s.t FOR EACH ROW EXECUTE FUNCTION f()">,
			D<"CREATE SCHEMA s CREATE TABLE t (x int[]) CREATE INDEX ON t (x) WHERE x = ARRAY[1] CREATE TABLE u (y int)">,
			D<"CREATE SCHEMA s CREATE TABLE t (x int) CREATE INDEX ON t (x) GRANT CREATE ON SCHEMA s TO public">,
			D<"CREATE SCHEMA s CREATE SEQUENCE q START 1 CREATE TABLE u (y int)">,
			D<"CREATE SCHEMA s CREATE TABLE t (x int) GRANT SELECT ON t TO CURRENT_USER WITH GRANT OPTION CREATE TABLE u (y int)">,
			D<"CREATE SCHEMA s CREATE TABLE t (x int) GRANT USAGE, CREATE ON SCHEMA s TO public CREATE TABLE u (y int)">,
		]
	>().toEqualTypeOf<
		[
			{ current_user: { t: { x: Nullable<"int4"> } } },
			{ current_role: { t: { x: Nullable<"int4"> } } },
			{ session_user: { t: { x: Nullable<"int4"> } } },
			{ s: { v: View<{ a: Col<"int4">; b: Col<"int4"> }> } },
			{
				$functions: { f: { readonly args: ["..."]; readonly ret: "trigger" } };
				s: { t: { x: Nullable<"int4"> } };
			},
			{ s: { t: { x: Nullable<"int4[]"> }; u: { y: Nullable<"int4"> } } },
			{ s: { t: { x: Nullable<"int4"> } } },
			{ s: { u: { y: Nullable<"int4"> } } },
			{ s: { t: { x: Nullable<"int4"> }; u: { y: Nullable<"int4"> } } },
			{ s: { t: { x: Nullable<"int4"> }; u: { y: Nullable<"int4"> } } },
		]
	>();
	expectTypeOf<
		[
			D<"CREATE VIEW v (a) WITH x AS SELECT 1">,
			D<"CREATE VIEW v AS SELECT (1">,
			D<"CREATE RECURSIVE VIEW v (n) AS SELECT (1">,
			D<"CREATE VIEW v AS SELECT 1 AS n; CREATE RECURSIVE VIEW v (n) AS SELECT 1">,
			D<"CREATE VIEW v AS SELECT 1 AS a LOCAL CHECK OPTION">,
			D<"CREATE TABLE t (a int); CREATE VIEW v AS SELECT a FROM t WITH CASCADED foo">,
			D<"CREATE SCHEMA AUTHORIZATION bob CREATE TABLE other.t (x int)">,
			D<"CREATE SCHEMA s CREATE VIEW v AS SELECT 1 AS a CREATE VIEW v AS SELECT 1 AS a">,
			D<"CREATE SCHEMA s CREATE VIEW v USING heap AS SELECT 1">,
			D<"CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; CREATE SCHEMA s CREATE TABLE t (x int) CREATE CONSTRAINT TRIGGER tr AFTER INSERT ON other.t FOR EACH ROW EXECUTE FUNCTION f()">,
			D<"CREATE SCHEMA s CREATE INDEX i (x)">,
			D<"CREATE SCHEMA s CREATE INDEX i">,
			D<"CREATE SCHEMA s CREATE INDEX ON 1 (x)">,
			D<"CREATE SCHEMA s; CREATE TABLE t (a int); ALTER TABLE t FOO SCHEMA s">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ADD PRIMARY KEY (1)">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ADD CONSTRAINT c PRIMARY x">,
			D<"CREATE TABLE t (a int); ALTER TABLE t ADD PRIMARY x">,
			D<"ALTER TYPE nope ALTER ATTRIBUTE a TYPE int">,
			D<"CREATE TYPE e AS ENUM ('a'); ALTER TYPE e ADD VALUE 'b' x 'a'">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"syntax error at or near x", 7>,
			SqlError<'syntax error: expected ")" at or near end of input', 7>,
			SqlError<'syntax error: expected ")" at or near end of input', 11>,
			SqlError<'relation "v" already exists', 12>,
			SqlError<"syntax error at or near local", 8>,
			SqlError<"syntax error at or near with", 16>,
			SqlError<
				"CREATE specifies a schema (other) different from the one being created (bob)",
				6
			>,
			SqlError<'relation "v" already exists', 5>,
			SqlError<"syntax error: expected AS at or near using", 6>,
			SqlError<
				"CREATE specifies a schema (other) different from the one being created (s)",
				29
			>,
			SqlError<"syntax error at or near (", 6>,
			SqlError<"syntax error at or near end of input", 6>,
			SqlError<"syntax error at or near 1", 6>,
			SqlError<"syntax error: expected ALTER TABLE action at or near foo", 15>,
			SqlError<"syntax error: expected column name at or near 1", 15>,
			SqlError<"syntax error: expected KEY at or near x", 15>,
			SqlError<"syntax error: expected KEY at or near x", 13>,
			SqlError<'type "nope" does not exist', 2>,
			SqlError<"syntax error at or near x", 15>,
		]
	>();
});
