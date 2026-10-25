import { expectTypeOf, test } from "vitest";
import type {
	ApplyDdl,
	Col,
	Generated,
	Nullable,
	NullableGenerated,
	SqlError,
	View,
} from "../../src/index.js";

// Schemas, enum renames and DROP TYPE, inheritance and LIKE, ALTER TABLE passes and the error
// positions of DDL scripts (ddl/apply.ts). Every statement was run on PostgreSQL 18; messages
// match it except where a comment says TypeSQL differs.
type D<Q extends string> = ApplyDdl<{}, Q>;

test("CREATE / DROP / ALTER SCHEMA", () => {
	expectTypeOf<
		D<"CREATE SCHEMA s CREATE TABLE t (x int) CREATE VIEW v AS SELECT x FROM t">
	>().toEqualTypeOf<{
		s: { t: { x: Nullable<"int4"> }; v: View<{ x: Nullable<"int4"> }> };
	}>();
	// the schema's own relations come first for INHERITS and LIKE
	expectTypeOf<
		D<"CREATE TABLE p (y int); CREATE SCHEMA s CREATE TABLE p (x int) CREATE TABLE c () INHERITS (p) CREATE TABLE d (LIKE p)">
	>().toEqualTypeOf<{
		p: { y: Nullable<"int4"> };
		s: {
			p: { x: Nullable<"int4"> };
			c: { x: Nullable<"int4"> };
			d: { x: Nullable<"int4"> };
		};
	}>();
	expectTypeOf<
		[
			D<"CREATE SCHEMA IF NOT EXISTS public">,
			D<"CREATE SCHEMA s; CREATE TABLE s.t (x int); DROP SCHEMA s CASCADE">,
			D<"DROP SCHEMA IF EXISTS nope, nope2">,
			D<"CREATE SCHEMA s; ALTER SCHEMA s RENAME TO t">,
		]
	>().toEqualTypeOf<[{}, {}, {}, { t: {} }]>();
	expectTypeOf<
		[
			D<"CREATE SCHEMA public">,
			D<"CREATE SCHEMA s; CREATE SCHEMA s CREATE TABLE t (x int)">,
			D<"CREATE SCHEMA s; CREATE TABLE s.t (x int); DROP SCHEMA s">,
			D<"DROP SCHEMA nope">,
			D<"ALTER SCHEMA nope RENAME TO t">,
			D<"CREATE SCHEMA s; CREATE SCHEMA t; ALTER SCHEMA s RENAME TO t">,
			D<"CREATE SCHEMA s; ALTER SCHEMA s RENAME TO public">,
			// TypeSQL: dropping public is not supported (Postgres: other objects depend on it)
			D<"DROP SCHEMA public">,
		]
	>().toEqualTypeOf<
		[
			SqlError<'schema "public" already exists', 2>,
			SqlError<'schema "s" already exists', 6>,
			SqlError<"cannot drop schema s because other objects depend on it", 16>,
			SqlError<'schema "nope" does not exist', 2>,
			SqlError<'schema "nope" does not exist', 2>,
			SqlError<'schema "t" already exists', 13>,
			SqlError<'schema "public" already exists', 9>,
			SqlError<"DROP SCHEMA public is not supported", 0>,
		]
	>();
});

/** An enum used by tables, an array column, views and a table in a schema. */
type E =
	"CREATE TYPE mood AS ENUM ('a', 'b'); CREATE SCHEMA s; CREATE TABLE t (m mood, ms mood[], x int); CREATE TABLE s.u (m mood, y int); CREATE VIEW v AS SELECT m FROM t; CREATE VIEW s.w AS SELECT m FROM s.u; CREATE VIEW s.w2 AS SELECT y FROM s.u; CREATE VIEW v2 AS SELECT x FROM t";

test("ALTER TYPE ... RENAME TO retypes every column; DROP TYPE ... CASCADE drops them", () => {
	expectTypeOf<D<`${E}; ALTER TYPE mood RENAME TO feeling`>>().toEqualTypeOf<{
		$types: { feeling: "a" | "b" };
		s: {
			u: { m: Nullable<"feeling">; y: Nullable<"int4"> };
			w: View<{ m: Nullable<"feeling"> }>;
			w2: View<{ y: Nullable<"int4"> }>;
		};
		t: {
			m: Nullable<"feeling">;
			ms: Nullable<"feeling[]">;
			x: Nullable<"int4">;
		};
		v: View<{ m: Nullable<"feeling"> }>;
		v2: View<{ x: Nullable<"int4"> }>;
	}>();
	// the views reading the type go, the others stay
	expectTypeOf<D<`${E}; DROP TYPE mood CASCADE`>>().toEqualTypeOf<{
		$types: {};
		s: { u: { y: Nullable<"int4"> }; w2: View<{ y: Nullable<"int4"> }> };
		t: { x: Nullable<"int4"> };
		v2: View<{ x: Nullable<"int4"> }>;
	}>();
	expectTypeOf<
		[
			D<"CREATE TYPE mood AS ENUM ('a'); CREATE TABLE t (x int); DROP TYPE mood">,
			D<"DROP TYPE IF EXISTS mood, nope">,
			D<"CREATE TYPE mood AS ENUM ('a'); CREATE SCHEMA s; CREATE TABLE s.t (x int); DROP TYPE mood">,
		]
	>().toEqualTypeOf<
		[
			{ $types: {}; t: { x: Nullable<"int4"> } },
			{},
			{ $types: {}; s: { t: { x: Nullable<"int4"> } } },
		]
	>();
	expectTypeOf<
		[
			D<`${E}; CREATE TYPE other AS ENUM ('c'); ALTER TYPE mood RENAME TO other`>,
			D<`${E}; DROP TYPE mood`>,
			D<"DROP TYPE nope">,
			// used in a schema's table (as an array), next to a function
			D<"CREATE TYPE mood AS ENUM ('a'); CREATE FUNCTION f() RETURNS int AS 'SELECT 1' LANGUAGE sql; CREATE SCHEMA s; CREATE TABLE s.t (m mood[]); DROP TYPE mood">,
		]
	>().toEqualTypeOf<
		[
			SqlError<'type "other" already exists', 102>,
			SqlError<"cannot drop type mood because other objects depend on it", 90>,
			SqlError<'type "nope" does not exist', 2>,
			SqlError<"cannot drop type mood because other objects depend on it", 39>,
		]
	>();
});

test("INHERITS and LIKE: merged columns, and their errors", () => {
	// NOT NULL if either parent has it, a default if either has one
	expectTypeOf<
		D<"CREATE TABLE a (x int NOT NULL); CREATE TABLE b (x int DEFAULT 1); CREATE TABLE c () INHERITS (a, b)">["c"]
	>().toEqualTypeOf<{ x: Generated<"int4"> }>();
	expectTypeOf<
		D<"CREATE TABLE a (x int); CREATE TABLE c (x int NOT NULL DEFAULT 2) INHERITS (a)">["c"]
	>().toEqualTypeOf<{ x: Generated<"int4"> }>();
	expectTypeOf<
		D<"CREATE TABLE a (x int NOT NULL); CREATE TABLE b (x int); CREATE TABLE c () INHERITS (b, a)">["c"]
	>().toEqualTypeOf<{ x: Col<"int4"> }>();
	expectTypeOf<
		D<"CREATE TABLE a (x int, y int); CREATE TABLE b (x int); CREATE TABLE c () INHERITS (a, b)">["c"]
	>().toEqualTypeOf<{ x: Nullable<"int4">; y: Nullable<"int4"> }>();
	expectTypeOf<
		[
			D<"CREATE TABLE a (x int); CREATE TABLE b (x text); CREATE TABLE c () INHERITS (a, b); SELECT 1 AS x">,
			D<"CREATE TABLE a (x int); CREATE TABLE c (x text) INHERITS (a)">,
			D<"CREATE TABLE c () INHERITS (nope)">,
			D<"CREATE TABLE c () INHERITS (public.nope)">,
			D<"CREATE TABLE c () INHERITS (nope.t)">,
			D<"CREATE SCHEMA s; CREATE TABLE c () INHERITS (s.t)">,
			D<"CREATE VIEW v AS SELECT 1 AS x; CREATE TABLE c () INHERITS (v)">,
			D<"CREATE SCHEMA s; CREATE VIEW s.v AS SELECT 1 AS x; CREATE TABLE c () INHERITS (s.v)">,
			D<"CREATE TABLE a (x int); CREATE TABLE b (x int); CREATE TABLE c (LIKE a, LIKE b)">,
			D<"CREATE TABLE b (LIKE nope.t)">,
			D<"CREATE TABLE b (LIKE public.nope)">,
			D<"CREATE SCHEMA s; CREATE TABLE b (LIKE s.nope)">,
			D<"CREATE SCHEMA s; CREATE TABLE s.t (x int); CREATE TABLE b (LIKE s)">,
		]
	>().toEqualTypeOf<
		[
			SqlError<'inherited column "x" has a type conflict', 16>,
			SqlError<'column "x" has a type conflict', 12>,
			SqlError<'relation "nope" does not exist', 7>,
			SqlError<'relation "public.nope" does not exist', 9>,
			SqlError<'schema "nope" does not exist', 7>,
			SqlError<'relation "s.t" does not exist', 13>,
			SqlError<'inherited relation "v" is not a table or foreign table', 16>,
			SqlError<'inherited relation "v" is not a table or foreign table', 24>,
			SqlError<'column "x" specified more than once', 16>,
			SqlError<'schema "nope" does not exist', 5>,
			SqlError<'relation "public.nope" does not exist', 7>,
			SqlError<'relation "s.nope" does not exist', 11>,
			SqlError<'relation "s" does not exist', 19>,
		]
	>();
});

test("schema elements: unqualified names in the new schema first, else public; their errors", () => {
	expectTypeOf<
		D<"CREATE TABLE q (z int); CREATE SCHEMA s CREATE TABLE c () INHERITS (q) CREATE TABLE d (LIKE q)">["s"]
	>().toEqualTypeOf<{
		c: { z: Nullable<"int4"> };
		d: { z: Nullable<"int4"> };
	}>();
	expectTypeOf<
		D<"CREATE TABLE p (y int); CREATE SCHEMA s CREATE TABLE p (x int) CREATE TABLE c () INHERITS (public.p) CREATE TABLE d (LIKE public.p)">["s"]
	>().toEqualTypeOf<{
		p: { x: Nullable<"int4"> };
		c: { y: Nullable<"int4"> };
		d: { y: Nullable<"int4"> };
	}>();
	expectTypeOf<
		[
			D<"CREATE SCHEMA s CREATE TABLE t (x int) CREATE TABLE t (y int) CREATE TABLE u (z int)">,
			D<"CREATE SCHEMA s CREATE TABLE t OF typ">,
		]
	>().toEqualTypeOf<
		[
			SqlError<'relation "t" already exists', 5>,
			SqlError<
				'typed table "t" (CREATE TABLE ... OF typ) is not supported: TypeSQL does not track the columns of composite types; list the columns',
				5
			>,
		]
	>();
});

test("a table without columns is a relation, not a schema", () => {
	expectTypeOf<D<"CREATE TABLE t (); SELECT * FROM t">>().toEqualTypeOf<{
		t: {};
	}>();
	expectTypeOf<D<"CREATE TABLE t (); CREATE TABLE t ()">>().toEqualTypeOf<
		SqlError<'relation "t" already exists', 8>
	>();
});

test("ALTER TYPE ... RENAME and DROP TYPE ... CASCADE leave the functions alone", () => {
	type F =
		"CREATE TYPE mood AS ENUM ('a'); CREATE FUNCTION f() RETURNS int AS 'SELECT 1' LANGUAGE sql";
	expectTypeOf<
		D<`${F}; CREATE TABLE t (m mood); ALTER TYPE mood RENAME TO feeling`>
	>().toEqualTypeOf<{
		$functions: { f: { readonly args: ["..."]; readonly ret: "int4" } };
		$types: { feeling: "a" };
		t: { m: Nullable<"feeling"> };
	}>();
	expectTypeOf<
		D<`${F}; CREATE TABLE t (m mood, x int); DROP TYPE mood CASCADE`>
	>().toEqualTypeOf<{
		$functions: { f: { readonly args: ["..."]; readonly ret: "int4" } };
		$types: {};
		t: { x: Nullable<"int4"> };
	}>();
});

test("where a relation can be created", () => {
	expectTypeOf<
		[
			D<"CREATE TABLE u (x int); CREATE TABLE u.t (y int)">,
			D<"CREATE TABLE nope.t (x int)">,
			D<"CREATE TABLE nope.t AS SELECT 1">,
			D<"CREATE VIEW nope.v AS SELECT 1">,
			D<"CREATE TYPE mood AS ENUM ('a'); CREATE TABLE \"$types\".t (x int)">,
			D<"CREATE TYPE mood AS ENUM ('a'); CREATE TABLE b (LIKE \"$types\")">,
			D<"CREATE FUNCTION f() RETURNS int AS 'SELECT 1' LANGUAGE sql; CREATE TABLE \"$functions\".t (x int)">,
			D<'CREATE TABLE "T" (x int); CREATE TABLE "T" (y int)'>,
			// TypeSQL keeps schemas and public relations in one object
			D<"CREATE SCHEMA s; CREATE TABLE s.u (a int); CREATE TABLE s AS SELECT 1">,
			D<"CREATE SCHEMA s; CREATE TABLE s.u (a int); CREATE VIEW s AS SELECT 1">,
			D<"CREATE SCHEMA s; CREATE TABLE s.u (a int); CREATE TABLE t (x int); ALTER TABLE t RENAME TO s">,
			D<"CREATE SCHEMA s; CREATE TABLE s.u (a int); CREATE SCHEMA x; CREATE TABLE x.s (a int); ALTER TABLE x.s SET SCHEMA public">,
			D<"CREATE TABLE t (x int); ALTER TABLE t SET SCHEMA nope">,
		]
	>().toEqualTypeOf<
		[
			SqlError<'schema "u" does not exist', 10>,
			SqlError<'schema "nope" does not exist', 2>,
			SqlError<'schema "nope" does not exist', 2>,
			SqlError<'schema "nope" does not exist', 2>,
			SqlError<'schema "$types" does not exist', 11>,
			SqlError<'relation "$types" does not exist', 14>,
			SqlError<'schema "$functions" does not exist', 14>,
			SqlError<'relation "T" already exists', 10>,
			SqlError<
				'cannot create relation "s": a schema with that name exists (TypeSQL keeps schemas and public relations in one object)',
				16
			>,
			SqlError<
				'cannot create relation "s": a schema with that name exists (TypeSQL keeps schemas and public relations in one object)',
				16
			>,
			SqlError<
				'cannot create relation "s": a schema with that name exists (TypeSQL keeps schemas and public relations in one object)',
				27
			>,
			SqlError<
				'cannot create relation "s": a schema with that name exists (TypeSQL keeps schemas and public relations in one object)',
				32
			>,
			SqlError<'schema "nope" does not exist', 13>,
		]
	>();
});

test("ALTER TABLE: an error in any pass, ADD PRIMARY KEY", () => {
	type T<A extends string> =
		D<`CREATE TABLE t (x int, y text); ALTER TABLE t ${A}`>;
	expectTypeOf<T<"ADD PRIMARY KEY (x)">["t"]>().toEqualTypeOf<{
		x: Col<"int4">;
		y: Nullable<"text">;
	}>();
	expectTypeOf<
		[
			T<"DROP COLUMN nope, ADD COLUMN z int">,
			T<"ALTER COLUMN nope TYPE int, ADD COLUMN z int">,
			T<"ADD COLUMN x int, ALTER COLUMN y SET NOT NULL">,
			T<"ALTER COLUMN nope SET NOT NULL, ALTER COLUMN y SET DEFAULT 'a'">,
			T<"ALTER COLUMN y SET DEFAULT 'a', ALTER COLUMN nope SET DEFAULT 1">,
			T<"ALTER COLUMN x ADD GENERATED ALWAYS AS IDENTITY">,
		]
	>().toEqualTypeOf<
		[
			SqlError<'column "nope" of relation "t" does not exist', 16>,
			SqlError<'column "nope" of relation "t" does not exist', 16>,
			SqlError<'column "x" of relation "t" already exists', 16>,
			SqlError<'column "nope" of relation "t" does not exist', 16>,
			SqlError<'column "nope" of relation "t" does not exist', 23>,
			SqlError<
				'column "x" of relation "t" must be declared NOT NULL before identity can be added',
				16
			>,
		]
	>();
	expectTypeOf<
		[
			D<"ALTER TABLE nope.t ADD COLUMN x int">,
			D<"ALTER TABLE public.nope ADD COLUMN x int">,
			D<"DROP TABLE nope.t">,
			D<"CREATE SCHEMA s; DROP TABLE s.nope">,
			D<"CREATE SCHEMA s; CREATE VIEW s.v AS SELECT 1 AS x; DROP TABLE s.v">,
			D<"CREATE SCHEMA s; CREATE TABLE s.t (x int); CREATE OR REPLACE VIEW s.t AS SELECT 1 AS x">,
		]
	>().toEqualTypeOf<
		[
			SqlError<'schema "nope" does not exist', 2>,
			SqlError<'relation "public.nope" does not exist', 4>,
			SqlError<'schema "nope" does not exist', 2>,
			SqlError<'table "nope" does not exist', 8>,
			SqlError<'"v" is not a table', 19>,
			SqlError<'"t" is not a view', 20>,
		]
	>();
	expectTypeOf<
		[
			D<"ALTER TABLE IF EXISTS nope.t ADD COLUMN x int">,
			D<"DROP TABLE IF EXISTS nope.t">,
		]
	>().toEqualTypeOf<[{}, {}]>();
});

test("views: duplicate names through a star; CREATE OR REPLACE checks", () => {
	type U = "CREATE TABLE users (id int, e text)";
	expectTypeOf<
		D<`${U}; CREATE VIEW v AS SELECT * FROM users`>["v"]
	>().toEqualTypeOf<View<{ id: Nullable<"int4">; e: Nullable<"text"> }>>();
	expectTypeOf<
		[
			D<`${U}; CREATE VIEW v AS SELECT *, id FROM users`>,
			D<`${U}; CREATE VIEW v AS SELECT id, * FROM users`>,
			D<`${U}; CREATE VIEW v AS SELECT u.*, w.* FROM users u, users w`>,
			D<"CREATE VIEW v AS SELECT ARRAY[1] AS a; CREATE OR REPLACE VIEW v AS SELECT 'x'::text AS a">,
			D<"CREATE VIEW v AS SELECT 1 AS a, 2 AS b; CREATE OR REPLACE VIEW v AS SELECT 1 AS a">,
		]
	>().toEqualTypeOf<
		[
			SqlError<'column "id" specified more than once', 18>,
			SqlError<'column "id" specified more than once', 16>,
			SqlError<'column "id" specified more than once', 11>,
			SqlError<
				'cannot change data type of view column "a" from integer[] to text',
				23
			>,
			SqlError<"cannot drop columns from view", 13>,
		]
	>();
});

test("typed tables (CREATE TABLE ... OF) are not supported, except when IF NOT EXISTS finds the table", () => {
	expectTypeOf<
		D<"CREATE TABLE t (x int); CREATE TABLE IF NOT EXISTS t OF typ">
	>().toEqualTypeOf<{ t: { x: Nullable<"int4"> } }>();
	expectTypeOf<
		[
			D<"CREATE TABLE t OF typ">,
			D<"CREATE TABLE t (x int); CREATE TABLE t OF typ">,
		]
	>().toEqualTypeOf<
		[
			SqlError<
				'typed table "t" (CREATE TABLE ... OF typ) is not supported: TypeSQL does not track the columns of composite types; list the columns',
				2
			>,
			SqlError<'relation "t" already exists', 10>,
		]
	>();
});

test("script errors: the lexer's, a query's own position, the second of two names", () => {
	expectTypeOf<
		[
			D<"CREATE TABLE t (x int); SELECT 'abc">,
			D<"CREATE TABLE t (x int); SELECT nope FROM t">,
			D<"CREATE TABLE t (x int, x int)">,
		]
	>().toEqualTypeOf<
		[
			SqlError<`unterminated quoted string at or near "'abc"`, 9>,
			SqlError<'column "nope" does not exist', 9>,
			SqlError<'column "x" specified more than once', 7>,
		]
	>();
	// NullableGenerated is what SET DEFAULT gives a nullable column
	expectTypeOf<
		D<"CREATE TABLE t (x int); ALTER TABLE t ALTER COLUMN x SET DEFAULT 1">["t"]
	>().toEqualTypeOf<{ x: NullableGenerated<"int4"> }>();
});
