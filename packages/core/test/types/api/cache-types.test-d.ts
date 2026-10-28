import { expectTypeOf, test } from "vitest";
import type {
	Builtin,
	CacheAnalysis,
	CachedAnalysis,
	CachedDdl,
	CacheVersion,
	DdlEffect,
	FreshVariants,
	HintIndex,
	IsUnion,
	Missing,
	OneOf,
	Plain,
	ReadyCallTable,
	Same,
	Second,
	Stale,
} from "../../../src/engine/cache.js";
import type { Shaped } from "../../../src/engine/shape.js";
import type { FunctionCatalog } from "../../../src/engine/typer/catalog.js";
import type { Col, Nullable, Sig, SqlError, View } from "../../../src/index.js";

// The type cache's freshness checks and lookups, with cache interfaces passed as parameters (the
// type tests run without a cache file; test/cache runs the generated ones).

interface DB {
	users: { id: Col<"int4">; name: Nullable<"text"> };
	v: View<{ n: Col<"int4"> }>;
	auth: {
		accounts: { id: Col<"int4"> };
		logins: View<{ at: Col<"date"> }>;
		/** not a relation: no hint names it */
		junk: { x: 1 };
	};
	pg_catalog: { pg_class: { oid: Col<"oid"> } };
	$types: { mood: "a" | "b" };
	$functions: { f: Sig<["int4"], "int4"> };
}

/** A snapshot of `DB` as an entry for `users`, `count`, `nope`, `pg_class`, `f` and `auth.accounts` records it. */
type Snap = {
	v: CacheVersion;
	t: { mood: "a" | "b" };
	w: {
		users: [DB["users"], Missing, Missing, Missing];
		count: [Missing, Missing, Missing, Builtin];
		sum: [Missing, Missing, Missing, FunctionCatalog["sum"]];
		nope: [Missing, Missing, Missing, Missing];
		pg_class: [Missing, DB["pg_catalog"]["pg_class"], Missing, Missing];
		f: [Missing, Missing, DB["$functions"]["f"], Missing];
	};
	q: {
		"auth.accounts": DB["auth"]["accounts"];
		"auth.nope": Missing;
		"nope.x": Missing;
		x: Missing;
	};
};
type With<K extends keyof Snap, V> = Omit<Snap, K> & { [P in K]: V };
type WithWord<W extends keyof Snap["w"], V> = With<
	"w",
	Omit<Snap["w"], W> & { [P in W]: V }
>;

test("Stale: nothing when every recorded part is unchanged", () => {
	expectTypeOf<Stale<DB, Snap>>().toEqualTypeOf<never>();
	expectTypeOf<
		Stale<DB, Snap & { h: HintIndex<DB>; all: DB }>
	>().toEqualTypeOf<never>();
});

test("Stale: the version or the enums make every entry stale", () => {
	expectTypeOf<Stale<DB, With<"v", "0">>>().toEqualTypeOf<"*">();
	expectTypeOf<Stale<DB, With<"t", { mood: "a" }>>>().toEqualTypeOf<"*">();
});

test("Stale: a word whose relation, pg_catalog relation, schema function or catalog entry changed", () => {
	expectTypeOf<
		[
			Stale<
				DB,
				WithWord<"users", [{ id: Col<"int4"> }, Missing, Missing, Missing]>
			>,
			Stale<
				DB,
				WithWord<"users", [DB["users"], DB["users"], Missing, Missing]>
			>,
			Stale<DB, WithWord<"pg_class", [Missing, Missing, Missing, Missing]>>,
			Stale<DB, WithWord<"f", [Missing, Missing, Missing, Missing]>>,
			Stale<
				DB,
				WithWord<"nope", [Missing, Missing, DB["$functions"]["f"], Missing]>
			>,
			// a built-in catalog entry is covered by the version; another is compared
			Stale<DB, WithWord<"sum", [Missing, Missing, Missing, Missing]>>,
			Stale<DB, WithWord<"nope", [Missing, Missing, Missing, Builtin]>>,
		]
	>().toEqualTypeOf<
		["users", "users", "pg_class", "f", "nope", "sum", never]
	>();
	// a nullability flag is a change (Col's flags only appear in conditional types)
	expectTypeOf<
		Stale<
			DB,
			WithWord<
				"users",
				[{ id: Col<"int4">; name: Col<"text"> }, Missing, Missing, Missing]
			>
		>
	>().toEqualTypeOf<"users">();
});

test("Stale: a schema without pg_catalog or $functions has neither for a word", () => {
	interface Bare {
		users: DB["users"];
	}
	expectTypeOf<
		Stale<
			Bare,
			{
				v: CacheVersion;
				t: {};
				w: { users: [Bare["users"], Missing, Missing, Missing] };
				q: {};
			}
		>
	>().toEqualTypeOf<never>();
});

test("Stale: qualified pairs, hint names, the whole schema", () => {
	expectTypeOf<
		[
			Stale<DB, With<"q", { "auth.accounts": Missing }>>,
			Stale<DB, With<"q", { "auth.nope": DB["users"] }>>,
			Stale<DB, With<"q", { "nope.accounts": DB["users"] }>>,
			Stale<DB, With<"q", { users: DB["users"] }>>,
		]
	>().toEqualTypeOf<["auth.accounts", "auth.nope", "nope.accounts", "users"]>();
	expectTypeOf<
		[Stale<DB, Snap & { h: "users" }>, Stale<DB, Snap & { all: {} }>]
	>().toEqualTypeOf<["!h", "!all"]>();
});

test("Same compares expanded copies; functions and TS shapes are compared as they are", () => {
	expectTypeOf<
		[
			Same<{ a: Col<"text"> }, { a: Col<"text"> }>,
			Same<{ a: Col<"text"> }, { a: Nullable<"text"> }>,
			Same<[Col<"text">], [Nullable<"text">]>,
			Same<"a", "a" | "b">,
			Same<"a" | "b", "a">,
			Same<() => 1, () => 1>,
			Same<() => 1, () => 2>,
			Same<{ k: "ts"; v: { a: 1 } }, { k: "ts"; v: { a: 1 } }>,
			Same<Col<"text">, Nullable<"text">>,
			// written out, the flags are what TypeScript's variance shortcut skips
			Same<Col<"text">, Col<"text", { nullable: true }>>,
			Same<{ a: Col<"text"> }, { a: Col<"text", { nullable: true }> }>,
			Same<{ k: "ts"; v: { a: 1 } }, { k: "ts"; v: { a: 2 } }>,
		]
	>().toEqualTypeOf<
		[
			true,
			false,
			false,
			false,
			false,
			true,
			false,
			true,
			false,
			false,
			false,
			false,
		]
	>();
});

test("HintIndex: relation names and relation.column, at the top level and in schemas", () => {
	expectTypeOf<HintIndex<DB>>().toEqualTypeOf<
		| "users"
		| "users.id"
		| "users.name"
		| "v"
		| "v.n"
		| "accounts"
		| "accounts.id"
		| "logins"
		| "logins.at"
		| "pg_class"
		| "pg_class.oid"
	>();
});

test("OneOf, IsUnion, Second", () => {
	expectTypeOf<
		[IsUnion<"a" | "b">, IsUnion<"a">, IsUnion<never>]
	>().toEqualTypeOf<[true, false, never]>();
	expectTypeOf<[OneOf<"a">, OneOf<never>]>().toEqualTypeOf<["a", never]>();
	expectTypeOf<OneOf<"a" | "b">>().toEqualTypeOf<"b">();
	expectTypeOf<[Second<["g", 1]>, Second<never>, Second<"x">]>().toEqualTypeOf<
		[1, never, never]
	>();
});

/**
 * Two cache files: `f1` with a fresh and a stale group, `f2` with another entry. Every entry
 * depends on `"*"` (the version and the enums), as the generator records it.
 */
interface Snaps {
	"f1#0": Snap;
	"f1#1": With<"v", "0">;
	"f2#0": Snap;
}
interface QC {
	"f1#0": {
		"SELECT 1": { r: "*" | "users"; a: "fresh" };
		"SELECT 2": { r: "*" | "users" | "pg_class"; a: "two" };
		"SELECT 3": { r: "*" | "users" };
	};
	"f1#1": { "SELECT 1": { r: "*" | "users"; a: "old" } };
	"f2#0": { "SELECT 4": { r: "*" | "users"; a: "f2" } };
}

test("FreshVariants / CachedAnalysis: entries whose group is fresh, or whose dependencies are", () => {
	expectTypeOf<FreshVariants<DB, "SELECT 1", QC, Snaps>>().toEqualTypeOf<
		["f1#0", { r: "*" | "users"; a: "fresh" }]
	>();
	expectTypeOf<
		[
			CachedAnalysis<DB, "SELECT 1", QC, Snaps>,
			CachedAnalysis<DB, "SELECT 2", QC, Snaps>,
			CachedAnalysis<DB, "SELECT 4", QC, Snaps>,
			// a miss, an entry without an analysis, a union key
			CachedAnalysis<DB, "SELECT 9", QC, Snaps>,
			CachedAnalysis<DB, "SELECT 3", QC, Snaps>,
			CachedAnalysis<DB, "SELECT 1" | "SELECT 2", QC, Snaps>,
		]
	>().toEqualTypeOf<["fresh", "two", "f2", never, never, never]>();
	// a stale part only drops the entries that depend on it; a group without a snapshot is stale
	type DB2 = Omit<DB, "pg_catalog"> & { pg_catalog: {} };
	expectTypeOf<
		[
			CachedAnalysis<DB2, "SELECT 1", QC, Snaps>,
			CachedAnalysis<DB2, "SELECT 2", QC, Snaps>,
			CachedAnalysis<DB, "SELECT 1", QC, {}>,
			CachedAnalysis<DB, "SELECT 1", QC, { "f1#0": 1 }>,
		]
	>().toEqualTypeOf<["fresh", never, never, never]>();
});

interface DC {
	f1: {
		"CREATE TABLE t ()": {
			d: Snap;
			r: "*" | "t";
			s: { t: { a: Col<"int4"> } };
			x: "users";
		};
		"DROP TABLE users": {
			d: Snap;
			r: "*" | "users";
			e: SqlError<"boom", null>;
		};
		"CREATE TABLE s ()": { d: With<"v", "0">; r: "*" | "s"; s: {}; x: never };
		"CREATE TABLE u ()": { d: Snap; r: "*" | "u" };
	};
}

test("CachedDdl: a fresh step's error, or its effect applied", () => {
	type After = CachedDdl<DB, "CREATE TABLE t ()", DC>;
	expectTypeOf<keyof After>().toEqualTypeOf<
		"v" | "auth" | "pg_catalog" | "$types" | "$functions" | "t"
	>();
	expectTypeOf<
		[
			CachedDdl<DB, "DROP TABLE users", DC>,
			CachedDdl<DB, "CREATE TABLE s ()", DC>,
			CachedDdl<DB, "CREATE TABLE u ()", DC>,
			CachedDdl<DB, "nope", DC>,
			CachedDdl<DB, "CREATE TABLE t ()" | "DROP TABLE users", DC>,
		]
	>().toEqualTypeOf<[SqlError<"boom", null>, never, never, never, never]>();
});

test("DdlEffect: the keys a step sets (new or changed) and removes", () => {
	expectTypeOf<
		DdlEffect<{ a: 1; b: 2; c: 3 }, { a: 1; b: 20; d: 4 }>
	>().toEqualTypeOf<{ readonly s: { b: 20; d: 4 }; readonly x: "c" }>();
});

test("CacheAnalysis stores Analyze without the statement; Plain writes aliases out", () => {
	expectTypeOf<CacheAnalysis<DB, "SELECT id FROM users">>().toEqualTypeOf<{
		readonly kind: "select";
		readonly cols: [
			{
				readonly n: "id";
				readonly t: { readonly type: "int4"; readonly nullable: false };
			},
		];
		readonly params: {};
		readonly max: 0;
		readonly names: [];
	}>();
	expectTypeOf<CacheAnalysis<DB, "SELECT nope FROM users">>().toEqualTypeOf<
		SqlError<
			'column "nope" does not exist. Perhaps you meant the column "name"?',
			1
		>
	>();
	expectTypeOf<
		Plain<[Shaped<"record", { a: 1 }>, { k: "ts"; v: () => 1 }, "x", 1]>
	>().toEqualTypeOf<
		[
			"record" & { readonly shape: { a: 1 } },
			{ readonly k: "ts"; readonly v: () => 1 },
			"x",
			1,
		]
	>();
});

test("call groups share compatibility checks and merge overlapping indexes", () => {
	type C = { m: 1; k: "preserve"; g: unknown; p: []; q: 1 };
	type S = Snap & { m: 1; k: "preserve"; c: { a: C } };
	type R<
		D = DB,
		M = 1,
		K = "preserve",
		G = { a: S; b: S & { c: { b: C } }; bad: Omit<S, "c"> & { c: 1 } },
	> = ReadyCallTable<D, M, K, G>;
	expectTypeOf<{ [K in keyof R]: R[K] }>().toEqualTypeOf<{ a: C; b: C }>();
	expectTypeOf<
		[R<DB, 2>, R<DB, 1, "camelCase">, R<{}, 1>, R<DB, 1, "preserve", {}>]
	>().toEqualTypeOf<[{}, {}, {}, {}]>();
});
