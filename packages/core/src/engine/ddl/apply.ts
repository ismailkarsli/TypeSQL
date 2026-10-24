import type {
	Col,
	Generated,
	Nullable,
	NullableGenerated,
	Table,
	View,
} from "../../schema/column.js";
import type {
	ColumnDef,
	DdlStmt,
	LikeClause,
	SelectStmt,
	Stmt,
	TableRef,
} from "../ast.js";
import type { AnyErr, SqlError } from "../errors.js";
import type { Lex } from "../lexer/lex.js";
import type { OpTok, Tok, Toks } from "../lexer/tokens.js";
import type { ParseStatement } from "../parser/stmt.js";
import type { AtEnd, Nx, Ok, SyntaxErrorAt } from "../parser/util.js";
import type { ProjectSelect } from "../project/select.js";
import type { ProjectStmt } from "../project/stmt.js";
import type { Sig } from "../typer/catalog.js";
import type { ColInfo, Cols, ColsToMap } from "../types.js";

/**
 * Apply DDL to a schema type.
 *
 *   ApplyDdlAll<DB, Q>      lex + parse `Q`, apply every `;`-separated statement in order
 *   ApplyDdlStmt<DB, Stmt>  one parsed DDL statement → new DB (or `SqlError<msg, null>`)
 *
 * Schema layout (see schema/column.ts): tables and views live at the top level of `DB`
 * (`public`), other schemas are nested objects (`DB["auth"]["users"]`), views are
 * `View<cols>` (`{ $view: cols }`), enums live in `DB["$types"]` as unions of string
 * literals, functions from CREATE FUNCTION in `DB["$functions"]` (see catalog.ts). Columns
 * are built with `Col` / `Nullable` / `Generated` / `NullableGenerated`, so results read like
 * a hand-written schema and compare equal to one.
 *
 * Statements without a schema effect (indexes, procedures, grants, ...) leave the schema
 * unchanged; SELECT / INSERT / UPDATE / DELETE are validated against the schema at that
 * point of the script and leave it unchanged.
 *
 * Semantic errors carry `null` as position; `ApplyDdlAll` locates the quoted identifier
 * of the message in the statement's tokens (the second occurrence for "specified more
 * than once").
 */
export type ApplyDdlStmt<DB, S extends DdlStmt> = ApplyDdlNode<DB, S>;

/** Same as `ApplyDdlStmt` without the constraint (pitfall 12: dispatch on `t` only). */
export type ApplyDdlNode<DB, S> = S extends {
	readonly t: "noop" | "fetch" | "move" | "close_cursor";
}
	? DB
	: S extends {
				readonly t: "declare_cursor";
				readonly q: infer Q extends SelectStmt;
			}
		? ProjectSelect<Q, DB, [], {}> extends infer C
			? C extends AnyErr
				? C
				: DB
			: never
		: S extends {
					readonly t: "create_table";
					readonly ifNotExists: infer Ine;
					readonly table: infer Ref extends TableRef;
					readonly columns: infer Defs;
					readonly constraints: infer Cons;
					readonly like: infer Likes;
					readonly inherits: infer Inh;
					readonly of: infer Of;
				}
			? Of extends TableRef
				? ApplyTypedTable<DB, Ine, Ref, Of>
				: ApplyCreateTable<DB, Ine, Ref, Defs, Cons, Likes, Inh>
			: S extends {
						readonly t: "create_table_as";
						readonly ifNotExists: infer Ine;
						readonly table: infer Ref extends TableRef;
						readonly cols: infer Names;
						readonly q: infer Q;
					}
				? ApplyCreateTableAs<DB, Ine, Ref, Names, Q>
				: S extends {
							readonly t: "alter_table";
							readonly ifExists: infer Ife;
							readonly table: infer Ref extends TableRef;
							readonly actions: infer As;
						}
					? ApplyAlterTable<DB, Ife, Ref, As>
					: S extends {
								readonly t: "drop_table";
								readonly ifExists: infer Ife;
								readonly tables: infer Refs;
							}
						? ApplyDropRels<DB, Refs, Ife, "table">
						: S extends {
									readonly t: "create_view";
									readonly orReplace: infer OrR;
									readonly materialized: infer Mat;
									readonly ifNotExists: infer Ine;
									readonly view: infer Ref extends TableRef;
									readonly cols: infer Names;
									readonly q: infer Q;
								}
							? ApplyCreateView<DB, OrR, Mat, Ine, Ref, Names, Q>
							: S extends {
										readonly t: "drop_view";
										readonly ifExists: infer Ife;
										readonly materialized: infer Mat;
										readonly views: infer Refs;
									}
								? ApplyDropRels<
										DB,
										Refs,
										Ife,
										Mat extends true ? "materialized view" : "view"
									>
								: S extends {
											readonly t: "create_enum";
											readonly name: {
												readonly name: infer Name extends string;
											};
											readonly values: infer Vs extends readonly string[];
										}
									? ApplyCreateEnum<DB, Name, Vs>
									: S extends {
												readonly t: "alter_enum";
												readonly name: {
													readonly name: infer Name extends string;
												};
												readonly action: infer Act;
											}
										? ApplyAlterEnum<DB, Name, Act>
										: S extends {
													readonly t: "drop_type";
													readonly ifExists: infer Ife;
													readonly names: infer Refs;
													readonly cascade: infer Casc;
												}
											? ApplyDropTypes<DB, Refs, Ife, Casc>
											: S extends {
														readonly t: "create_schema";
														readonly ifNotExists: infer Ine;
														readonly name: infer Name extends string;
														readonly elements: infer Els;
													}
												? ApplyCreateSchema<DB, Ine, Name> extends infer DB2
													? DB2 extends AnyErr
														? DB2
														: ApplyElements<DB2, Name, Els>
													: never
												: S extends {
															readonly t: "drop_schema";
															readonly ifExists: infer Ife;
															readonly names: infer Names;
															readonly cascade: infer Casc;
														}
													? ApplyDropSchemas<DB, Names, Ife, Casc>
													: S extends {
																readonly t: "rename_schema";
																readonly from: infer F extends string;
																readonly to: infer To extends string;
															}
														? ApplyRenameSchema<DB, F, To>
														: S extends {
																	readonly t: "create_function";
																	readonly name: {
																		readonly name: infer Name extends string;
																	};
																	readonly ret: infer Ret extends string;
																	readonly srf: infer Srf;
																}
															? ApplyCreateFunction<DB, Name, Ret, Srf>
															: SqlError<"unsupported DDL statement", null>;

// ───────────────────────────── scripts ─────────────────────────────

type DdlKind = DdlStmt["t"];

/** Apply every statement of `Q` (separated by `;`) in order. Errors are positioned at the offending token. */
export type ApplyDdlAll<DB, Q extends string> =
	Lex<Q> extends infer T
		? T extends Toks
			? ApplyLoop<DB, T, 0>
			: Plain<T>
		: never;

type ApplyLoop<DB, T extends Toks, I extends number> =
	AtEnd<T, I> extends true
		? DB
		: T[I] extends OpTok<";">
			? ApplyLoop<DB, T, Nx<I>>
			: ParseStatement<T, I> extends infer R
				? R extends Ok<infer S, infer J extends number>
					? (
							AtEnd<T, J> extends true
								? true
								: T[J] extends OpTok<";">
									? true
									: false
						) extends false
						? Plain<SyntaxErrorAt<T, J>>
						: ApplyOne<DB, S> extends infer DB2
							? DB2 extends AnyErr
								? RepositionFrom<DB2, T, I>
								: ApplyLoop<DB2, T, J>
							: never
					: Plain<R>
				: never;

/** DDL changes the schema; queries and DML are validated and leave it unchanged. */
type ApplyOne<DB, S> = S extends { readonly t: DdlKind }
	? ApplyDdlNode<DB, S>
	: S extends Stmt
		? ProjectStmt<S, DB, [], {}> extends infer C
			? C extends AnyErr
				? C
				: DB
			: never
		: SqlError<"unsupported statement", null>;

/** Re-spell an error as `SqlError<message, position>` (hovers show the message, not the helper that built it). */
type Plain<E> =
	E extends SqlError<infer M extends string, infer At> ? SqlError<M, At> : E;

/** Semantic errors name the offending identifier in quotes; find it from the statement start. */
type RepositionFrom<E, T extends Toks, Start extends number> =
	E extends SqlError<infer M extends string, infer At>
		? SqlError<M, At extends number ? At : LocateFrom<M, T, Start>>
		: E;
type LocateFrom<
	M extends string,
	T extends Toks,
	Start extends number,
> = M extends `function ${infer Name}(${string}`
	? FindTok<T, Name, Start, Start>
	: M extends `${string}"${infer Name}"${string}`
		? FindTok<T, LastPart<Name>, Start, Start> extends infer F extends number
			? M extends `${string} specified more than once`
				? F extends Start
					? F
					: FindTok<T, LastPart<Name>, Nx<F>, F>
				: F
			: Start
		: M extends `cannot drop ${string} ${infer Name} because ${string}`
			? FindTok<T, Name, Start, Start>
			: Start;
type LastPart<N extends string> = N extends `${string}.${infer R}`
	? LastPart<R>
	: N;
/** Index of the first word / identifier / string token spelled `Name` from `I` to the end of the statement. */
type FindTok<
	T extends Toks,
	Name extends string,
	I extends number,
	Fallback,
> = T[I] extends { readonly k: "w" | "id" | "s"; readonly v: Name }
	? I
	: T[I] extends OpTok<";">
		? Fallback
		: T[I] extends Tok
			? FindTok<T, Name, Nx<I>, Fallback>
			: Fallback;

// ───────────────────────────── object helpers ─────────────────────────────

/**
 * Object construction. Every object the applier stores (DB, schema, table, `$types`) is
 * rebuilt from single-key parts whose only type arguments are the key and an already
 * resolved value:
 *
 *   Build<Single<"id", Col<"int4">> | Single<"email", Col<"text">>>  →  { id: ...; email: ... }
 *
 * Why: a mapped type keeps its source as a type argument, and TypeScript re-instantiates
 * those arguments whenever the object is the check type of a conditional (permissive
 * instantiation) or flows through `infer`. If each statement mapped over the previous
 * schema, every schema would drag the whole migration history along, and around 40-50
 * statements later any conditional over it (here, or in the binder) fails with
 * "excessively deep". With single-key parts, a schema references its tables, a table its
 * column descriptors, and nothing older: depth stays constant (300-statement chains
 * measured). Unchanged tables are carried over as the same objects.
 *
 * `Flat` is `{...} & {}` so hovers show the expanded object, not an alias.
 */
type Single<K extends PropertyKey, V> = { [P in K]: V };
type U2I<U> = (U extends unknown ? (x: U) => void : never) extends (
	x: infer I,
) => void
	? I
	: never;
type Flat<T> = { [K in keyof T]: T[K] } & {};
type Build<U> = [U] extends [never] ? {} : Flat<U2I<U>>;
/** A history-free copy of `O` (an intersection, or a mapped type over an older object). */
type Rebuild<O> = Build<{ [K in keyof O]: Single<K & string, O[K]> }[keyof O]>;
/** Replace an existing key in place, or append a new one. */
type SetKey<O, K extends string, V> = Build<
	| { [P in keyof O]: Single<P & string, P extends K ? V : O[P]> }[keyof O]
	| (K extends keyof O ? never : Single<K, V>)
>;
type DelKey<O, K> = Build<
	{ [P in keyof O]: P extends K ? never : Single<P & string, O[P]> }[keyof O]
>;
type RenameKey<O, From, To extends string> = Build<
	{ [P in keyof O]: Single<P extends From ? To : P & string, O[P]> }[keyof O]
>;
/**
 * `DB` with `Del`'s keys removed and `Set`'s keys set: a cached step's effect (engine/cache.ts
 * `DdlEffect`), rebuilt from single-key parts like every other schema.
 */
export type ApplyPatch<DB, Set, Del> = Build<
	| {
			[P in keyof DB]: P extends Del | keyof Set
				? never
				: Single<P & string, DB[P]>;
	  }[keyof DB]
	| { [K in keyof Set]: Single<K & string, Set[K]> }[keyof Set]
>;
/** One member of a union (the last one TypeScript sees). */
type PickOne<U> = (U extends unknown ? (x: () => U) => void : never) extends (
	x: infer F,
) => void
	? F extends () => infer R
		? R
		: never
	: never;

// ───────────────────────────── relations ─────────────────────────────

type IsTop<S> = S extends null | "public" ? true : false;
type Display<Ref extends TableRef> =
	IsTop<Ref["schema"]> extends true
		? Ref["name"]
		: `${Ref["schema"] & string}.${Ref["name"]}`;

type IsViewVal<X> = X extends { readonly $view: unknown } ? true : false;
/** A namespace (nested schema) maps names to tables/views; a table maps names to column descriptors. */
type IsNamespace<X> = X extends { readonly $view: unknown }
	? false
	: [keyof X] extends [never]
		? false
		: X[keyof X] extends { readonly type: string }
			? false
			: true;
/** Top-level key holding a schema (an empty object counts: it may be an empty schema). */
type IsSchemaKey<DB, K extends string> = K extends keyof DB
	? K extends MetaKey
		? false
		: [keyof DB[K]] extends [never]
			? true
			: IsNamespace<DB[K]>
	: false;

/** Table or view at `Ref`, or `null` when absent (a missing schema counts as absent). */
type GetRel<DB, Ref extends TableRef> =
	IsTop<Ref["schema"]> extends true
		? Ref["name"] extends keyof DB
			? Ref["name"] extends MetaKey
				? null
				: IsNamespace<DB[Ref["name"]]> extends true
					? null
					: DB[Ref["name"]]
			: null
		: Ref["schema"] extends keyof DB
			? Ref["name"] extends keyof DB[Ref["schema"]]
				? DB[Ref["schema"]][Ref["name"]]
				: null
			: null;

type SchemaExists<DB, S> =
	IsTop<S> extends true ? true : S extends string ? IsSchemaKey<DB, S> : false;
type NoSchema<S> = SqlError<`schema "${S & string}" does not exist`, null>;
/** A new top-level relation would overwrite a schema (schemas and public relations share `DB`'s keys). */
type SchemaClash<DB, Ref extends TableRef> =
	IsTop<Ref["schema"]> extends true
		? Ref["name"] extends keyof DB
			? SqlError<
					`cannot create relation "${Ref["name"]}": a schema with that name exists (TypeSQL keeps schemas and public relations in one object)`,
					null
				>
			: null
		: null;
/** Checks before adding a relation at `Ref`: `null` when it can be added. */
type CanCreate<DB, Ref extends TableRef> =
	SchemaExists<DB, Ref["schema"]> extends false
		? NoSchema<Ref["schema"]>
		: SchemaClash<DB, Ref>;

type PutRel<DB, Ref extends TableRef, V> =
	IsTop<Ref["schema"]> extends true
		? SetKey<DB, Ref["name"], V>
		: Ref["schema"] extends keyof DB
			? SetKey<
					DB,
					Ref["schema"] & string,
					SetKey<DB[Ref["schema"]], Ref["name"], V>
				>
			: NoSchema<Ref["schema"]>;
type DelRel<DB, Ref extends TableRef> =
	IsTop<Ref["schema"]> extends true
		? DelKey<DB, Ref["name"]>
		: Ref["schema"] extends keyof DB
			? SetKey<
					DB,
					Ref["schema"] & string,
					DelKey<DB[Ref["schema"]], Ref["name"]>
				>
			: DB;
type RenameRel<DB, Ref extends TableRef, To extends string> =
	IsTop<Ref["schema"]> extends true
		? RenameKey<DB, Ref["name"], To>
		: Ref["schema"] extends keyof DB
			? SetKey<
					DB,
					Ref["schema"] & string,
					RenameKey<DB[Ref["schema"]], Ref["name"], To>
				>
			: DB;

/** Column map of a table or view value. */
type ColsOf<Rel> = Rel extends { readonly $view: infer C } ? C : Rel;
type Rewrap<Rel, C> = IsViewVal<Rel> extends true ? AsView<C> : C;
type AsView<C> = C extends Table ? View<C> : { readonly $view: C };

// ───────────────────────────── columns ─────────────────────────────

/** Column descriptor spelled the way a user writes it (`Col`, `Nullable`, `Generated`, `NullableGenerated`). */
type MkCol<Ty extends string, N, H> = N extends true
	? H extends true
		? NullableGenerated<Ty>
		: Nullable<Ty>
	: H extends true
		? Generated<Ty>
		: Col<Ty>;
type DescOf<D extends ColumnDef> = MkCol<
	D["type"],
	D["notNull"] extends true ? false : true,
	D["hasDefault"]
>;
type TypeOfCol<C> = C extends { readonly type: infer Ty extends string }
	? Ty
	: never;
type NullOf<C> = C extends { readonly nullable: infer N } ? N : true;
type DefOf<C> = C extends { readonly hasDefault: infer H } ? H : false;
type WithNullable<C, N> = MkCol<TypeOfCol<C>, N, DefOf<C>>;
type WithDefault<C, H> = MkCol<TypeOfCol<C>, NullOf<C>, H>;
type WithType<C, Ty extends string> = MkCol<Ty, NullOf<C>, DefOf<C>>;

/** Postgres's spelling of a canonical type name (error messages). */
type PgDisplay = {
	int2: "smallint";
	int4: "integer";
	int8: "bigint";
	float4: "real";
	float8: "double precision";
	bool: "boolean";
	varchar: "character varying";
	bpchar: "character";
	varbit: "bit varying";
	timestamp: "timestamp without time zone";
	timestamptz: "timestamp with time zone";
	time: "time without time zone";
	timetz: "time with time zone";
};
type DisplayType<T extends string> = T extends `${infer E}[]`
	? `${DisplayType<E>}[]`
	: T extends keyof PgDisplay
		? PgDisplay[T]
		: T;

// ───────────────────────────── CREATE TABLE ─────────────────────────────

/** `CREATE TABLE t OF type`: the columns come from a composite type, which TypeSQL does not track. */
type ApplyTypedTable<DB, Ine, Ref extends TableRef, Of extends TableRef> =
	GetRel<DB, Ref> extends null
		? SqlError<
				`typed table "${Ref["name"]}" (CREATE TABLE ... OF ${Of["name"]}) is not supported: TypeSQL does not track the columns of composite types; list the columns`,
				null
			>
		: Ine extends true
			? DB
			: SqlError<`relation "${Ref["name"]}" already exists`, null>;

type ApplyCreateTable<DB, Ine, Ref extends TableRef, Defs, Cons, Likes, Inh> =
	GetRel<DB, Ref> extends null
		? CanCreate<DB, Ref> extends infer E
			? E extends AnyErr
				? E
				: BuildTable<DB, Ref["name"], Defs, Cons, Likes, Inh> extends infer Tbl
					? Tbl extends AnyErr
						? Tbl
						: PutRel<DB, Ref, Tbl>
					: never
			: never
		: Ine extends true
			? DB
			: SqlError<`relation "${Ref["name"]}" already exists`, null>;

/** Inherited columns, then LIKE columns, then local definitions; then NOT NULL for the primary key and table-level NOT NULL constraints. */
type BuildTable<DB, TN extends string, Defs, Cons, Likes, Inh> =
	AddInherits<Inh, DB, {}> extends infer A0
		? A0 extends AnyErr
			? A0
			: AddLikes<Likes, DB, A0, never> extends infer A1
				? A1 extends readonly [infer Acc1, infer Seen1]
					? AddDefs<Defs, Acc1, keyof A0, Seen1> extends infer A2
						? A2 extends AnyErr
							? A2
							: PrimaryKey<Defs, Cons, A2, TN> extends infer Pk
								? Pk extends readonly [infer P]
									? ConNotNulls<Cons> extends infer NN
										? [Exclude<NN, keyof A2>] extends [never]
											? Rebuild<{
													[K in keyof A2]: K extends P | NN
														? WithNullable<A2[K], false>
														: A2[K];
												}>
											: SqlError<
													`column "${PickOne<Exclude<NN, keyof A2>> & string}" of relation "${TN}" does not exist`,
													null
												>
										: never
									: Pk
								: never
						: never
					: A1
				: never
		: never;

/** `INHERITS (parents)` / `PARTITION OF parent`: columns with NOT NULL and defaults; same-named columns merge. */
type AddInherits<Ps, DB, Acc> = Ps extends readonly [
	infer P extends TableRef,
	...infer R,
]
	? GetRel<DB, P> extends infer Rel
		? Rel extends null
			? SqlError<`relation "${Display<P>}" does not exist`, null>
			: IsViewVal<Rel> extends true
				? SqlError<
						`inherited relation "${Display<P>}" is not a table or foreign table`,
						null
					>
				: TypeConflict<Acc, Rel> extends infer K
					? [K] extends [never]
						? AddInherits<R, DB, MergeCols<Acc, Rel>>
						: SqlError<
								`column "${PickOne<K> & string}" has a type conflict`,
								null
							>
					: never
		: never
	: Acc;
type TypeConflict<A, B> = {
	[K in keyof A & keyof B]: TypeOfCol<A[K]> extends TypeOfCol<B[K]>
		? TypeOfCol<B[K]> extends TypeOfCol<A[K]>
			? never
			: K
		: K;
}[keyof A & keyof B];
/** NOT NULL if either side is, a default if either side has one. */
type MergeCol<A, B> = MkCol<
	TypeOfCol<A>,
	NullOf<A> extends true ? NullOf<B> : false,
	DefOf<A> extends true ? true : DefOf<B>
>;
type MergeCols<A, B> = Rebuild<
	{ [K in keyof A]: K extends keyof B ? MergeCol<A[K], B[K]> : A[K] } & {
		[K in Exclude<keyof B, keyof A>]: B[K];
	}
>;

/** `LIKE src`: names, types and NOT NULL; defaults only with INCLUDING DEFAULTS | IDENTITY | GENERATED | ALL. → `[Acc, Seen]` */
type AddLikes<Ls, DB, Acc, Seen> = Ls extends readonly [
	infer L extends LikeClause,
	...infer R,
]
	? GetRel<DB, L["ref"]> extends infer Rel
		? Rel extends null
			? SqlError<`relation "${Display<L["ref"]>}" does not exist`, null>
			: CopyCols<ColsOf<Rel>, L["defaults"]> extends infer C
				? [keyof C & keyof Acc] extends [never]
					? AddLikes<R, DB, Acc & C, Seen | keyof C>
					: SqlError<
							`column "${PickOne<keyof C & keyof Acc> & string}" specified more than once`,
							null
						>
				: never
		: never
	: [Acc, Seen];
type CopyCols<Tbl, Defaults> = {
	[K in keyof Tbl]: Defaults extends true ? Tbl[K] : WithDefault<Tbl[K], false>;
};

/** Local column definitions. A name seen locally (or via LIKE) is a duplicate; an inherited name merges. */
type AddDefs<Defs, Acc, Inh, Seen> = Defs extends readonly [
	infer D extends ColumnDef,
	...infer R,
]
	? D["name"] extends Seen
		? SqlError<`column "${D["name"]}" specified more than once`, null>
		: D["name"] extends Inh
			? D["name"] extends keyof Acc
				? TypeOfCol<Acc[D["name"]]> extends D["type"]
					? AddDefs<
							R,
							Rebuild<{
								[K in keyof Acc]: K extends D["name"]
									? MergeCol<DescOf<D>, Acc[K]>
									: Acc[K];
							}>,
							Inh,
							Seen | D["name"]
						>
					: SqlError<`column "${D["name"]}" has a type conflict`, null>
				: never
			: AddDefs<R, Acc & { [P in D["name"]]: DescOf<D> }, Inh, Seen | D["name"]>
	: Acc;

/** `[names]`: the primary-key column names (a union, `never` without a key), or an error. */
type PrimaryKey<Defs, Cons, Acc, TN extends string> =
	ConPks<Cons, ColPks<Defs, []>> extends infer L
		? L extends readonly [unknown, unknown, ...unknown[]]
			? SqlError<
					`multiple primary keys for table "${TN}" are not allowed`,
					null
				>
			: L extends readonly [infer P extends readonly string[]]
				? FirstMissing<P, Acc> extends infer M extends string
					? SqlError<`column "${M}" named in key does not exist`, null>
					: [P[number]]
				: [never]
		: never;
type ColPks<Defs, Acc extends readonly unknown[]> = Defs extends readonly [
	infer D,
	...infer R,
]
	? ColPks<
			R,
			D extends { readonly primaryKey: true; readonly name: infer N }
				? [...Acc, [N]]
				: Acc
		>
	: Acc;
type ConPks<Cons, Acc extends readonly unknown[]> = Cons extends readonly [
	infer C,
	...infer R,
]
	? ConPks<
			R,
			C extends { readonly t: "pk"; readonly cols: infer Cs }
				? [...Acc, Cs]
				: Acc
		>
	: Acc;
/** Columns of table-level `NOT NULL col` constraints (a union). */
type ConNotNulls<Cons> = Cons extends readonly (infer C)[]
	? C extends { readonly t: "not_null"; readonly col: infer N }
		? N
		: never
	: never;
type FirstMissing<Cs, Tbl> = Cs extends readonly [infer C, ...infer R]
	? C extends keyof Tbl
		? FirstMissing<R, Tbl>
		: C
	: null;

// ─── CREATE TABLE AS / views: columns from a query ───

/** Project the query, apply the column-name list, reject duplicate names → column map or error. */
type QueryCols<DB, Q, Names, TooMany extends string> = (
	Q extends SelectStmt
		? ProjectSelect<Q, DB, [], {}>
		: Q extends { readonly t: "execute"; readonly name: infer N extends string }
			? SqlError<
					`CREATE TABLE ... AS EXECUTE ${N} is not supported: the columns of a prepared statement are unknown`,
					null
				>
			: SqlError<"unsupported query", null>
) extends infer C
	? C extends Cols
		? NameCols<C, Names, [], TooMany> extends infer C2
			? C2 extends Cols
				? DupCol<C2, never> extends infer Dup
					? Dup extends string
						? SqlError<`column "${Dup}" specified more than once`, null>
						: ColsToMap<C2>
					: never
				: C2
			: never
		: C
	: never;

/** Positional renaming by a column-name list; extra query columns keep their names. */
type NameCols<
	C extends Cols,
	Names,
	Acc extends Cols,
	TooMany extends string,
> = Names extends readonly [infer N extends string, ...infer NR]
	? C extends readonly [infer H, ...infer R extends Cols]
		? H extends { readonly n: string; readonly t: infer I extends ColInfo }
			? NameCols<R, NR, [...Acc, { readonly n: N; readonly t: I }], TooMany>
			: SqlError<
					"a column name list cannot rename the columns of a * projection (TypeSQL limitation): list the columns explicitly",
					null
				>
		: SqlError<TooMany, null>
	: [...Acc, ...C];

/** First duplicate output name, or null. */
type DupCol<C extends Cols, Seen> = C extends readonly [
	infer H,
	...infer R extends Cols,
]
	? H extends { readonly star: infer M }
		? [keyof M & Seen] extends [never]
			? DupCol<R, Seen | keyof M>
			: PickOne<keyof M & Seen>
		: H extends { readonly n: infer N }
			? [N] extends [Seen]
				? N
				: DupCol<R, Seen | N>
			: null
	: null;

type ApplyCreateTableAs<DB, Ine, Ref extends TableRef, Names, Q> =
	GetRel<DB, Ref> extends null
		? CanCreate<DB, Ref> extends infer E
			? E extends AnyErr
				? E
				: QueryCols<
							DB,
							Q,
							Names,
							"too many column names were specified"
						> extends infer M
					? M extends AnyErr
						? M
						: PutRel<DB, Ref, CtasTable<M>>
					: never
			: never
		: Ine extends true
			? DB
			: SqlError<`relation "${Ref["name"]}" already exists`, null>;

/** CREATE TABLE AS keeps names and types only: every column is nullable, without default (as Postgres). */
type CtasTable<M> = Rebuild<{
	[K in keyof M]: MkCol<TypeOfCol<M[K]>, true, false>;
}>;
/** View columns keep the query's nullability. */
type ViewTable<M> = Rebuild<{
	[K in keyof M]: MkCol<TypeOfCol<M[K]>, NullOf<M[K]>, false>;
}>;

// ───────────────────────────── DROP TABLE / VIEW ─────────────────────────────

type ApplyDropRels<
	DB,
	Refs,
	Ife,
	Kind extends "table" | "view" | "materialized view",
> = Refs extends readonly [infer R extends TableRef, ...infer Rest]
	? GetRel<DB, R> extends infer Rel
		? Rel extends null
			? Ife extends true
				? ApplyDropRels<DB, Rest, Ife, Kind>
				: SqlError<`${Kind} "${Display<R>}" does not exist`, null>
			: (
						IsViewVal<Rel> extends true
							? Kind extends "table"
								? false
								: true
							: Kind extends "table"
								? true
								: false
					) extends true
				? ApplyDropRels<DelRel<DB, R>, Rest, Ife, Kind>
				: SqlError<`"${Display<R>}" is not a ${Kind}`, null>
		: never
	: DB;

// ───────────────────────────── ALTER TABLE ─────────────────────────────

type ApplyAlterTable<DB, Ife, Ref extends TableRef, As> =
	GetRel<DB, Ref> extends infer Rel
		? Rel extends null
			? Ife extends true
				? DB
				: SqlError<`relation "${Display<Ref>}" does not exist`, null>
			: As extends readonly [
						{
							readonly t: "rename_table";
							readonly to: infer To extends string;
						},
					]
				? RenameTable<DB, Ref, To>
				: As extends readonly [
							{
								readonly t: "set_schema";
								readonly schema: infer S extends string;
							},
						]
					? SetSchema<DB, Ref, S, Rel>
					: As extends readonly [
								{
									readonly t: "rename_column";
									readonly from: infer F extends string;
									readonly to: infer To extends string;
								},
							]
						? RenameColumn<DB, Ref, Rel, F, To>
						: (
									IsViewVal<Rel> extends true
										? ViewActionError<As, Ref["name"]>
										: null
								) extends infer VE
							? VE extends AnyErr
								? VE
								: RunPasses<ColsOf<Rel>, As, Ref["name"]> extends infer T2
									? T2 extends AnyErr
										? T2
										: PutRel<DB, Ref, Rewrap<Rel, T2>>
									: never
							: never
		: never;

type RenameTable<DB, Ref extends TableRef, To extends string> =
	GetRel<DB, { schema: Ref["schema"]; name: To }> extends null
		? SchemaClash<DB, { schema: Ref["schema"]; name: To }> extends infer E
			? E extends AnyErr
				? E
				: RenameRel<DB, Ref, To>
			: never
		: SqlError<`relation "${To}" already exists`, null>;

type SetSchema<DB, Ref extends TableRef, S extends string, Rel> =
	SchemaExists<DB, S> extends false
		? NoSchema<S>
		: GetRel<DB, { schema: S; name: Ref["name"] }> extends null
			? SchemaClash<DB, { schema: S; name: Ref["name"] }> extends infer E
				? E extends AnyErr
					? E
					: PutRel<DelRel<DB, Ref>, { schema: S; name: Ref["name"] }, Rel>
				: never
			: SqlError<
					`relation "${Ref["name"]}" already exists in schema "${S}"`,
					null
				>;

type RenameColumn<
	DB,
	Ref extends TableRef,
	Rel,
	F extends string,
	To extends string,
> = F extends keyof ColsOf<Rel>
	? To extends keyof ColsOf<Rel>
		? SqlError<
				`column "${To}" of relation "${Ref["name"]}" already exists`,
				null
			>
		: PutRel<DB, Ref, Rewrap<Rel, RenameKey<ColsOf<Rel>, F, To>>>
	: SqlError<`column "${F}" does not exist`, null>;

/** Postgres's wording for sub-commands a view does not support (renames and defaults are fine). */
type ViewActionName = {
	add_column: "ADD COLUMN";
	drop_column: "DROP COLUMN";
	alter_type: "ALTER COLUMN ... SET DATA TYPE";
	set_not_null: "ALTER COLUMN ... SET NOT NULL";
	drop_not_null: "ALTER COLUMN ... DROP NOT NULL";
	add_identity: "ALTER COLUMN ... ADD IDENTITY";
	add_pk: "ADD CONSTRAINT";
};
type ViewActionError<As, TN extends string> = As extends readonly [
	{ readonly t: infer K },
	...infer R,
]
	? K extends keyof ViewActionName
		? SqlError<
				`ALTER action ${ViewActionName[K]} cannot be performed on relation "${TN}"`,
				null
			>
		: ViewActionError<R, TN>
	: null;

/**
 * Postgres runs ALTER TABLE sub-commands in passes, not left to right: drops first
 * (DROP COLUMN / NOT NULL / DEFAULT / IDENTITY / EXPRESSION), then ALTER TYPE, then
 * ADD COLUMN, then NOT NULL / identity / primary key, then SET DEFAULT. So
 * `ADD COLUMN x ..., DROP COLUMN x` fails and `DROP COLUMN x, ADD COLUMN x ...` works.
 */
type RunPasses<Tbl, As, TN extends string> =
	RunPass<
		Tbl,
		As,
		TN,
		"drop_column" | "drop_not_null" | "drop_default"
	> extends infer T1
		? T1 extends AnyErr
			? T1
			: RunPass<T1, As, TN, "alter_type"> extends infer T2
				? T2 extends AnyErr
					? T2
					: RunPass<T2, As, TN, "add_column"> extends infer T3
						? T3 extends AnyErr
							? T3
							: RunPass<
										T3,
										As,
										TN,
										"set_not_null" | "add_identity" | "add_pk"
									> extends infer T4
								? T4 extends AnyErr
									? T4
									: RunPass<T4, As, TN, "set_default">
								: never
						: never
				: never
		: never;

type RunPass<Tbl, As, TN extends string, K> = As extends readonly [
	infer A,
	...infer R,
]
	? A extends { readonly t: K }
		? ColAction<Tbl, A, TN> extends infer T2
			? T2 extends AnyErr
				? T2
				: RunPass<T2, R, TN, K>
			: never
		: RunPass<Tbl, R, TN, K>
	: Tbl;

type NoColumn<C extends string, TN extends string> = SqlError<
	`column "${C}" of relation "${TN}" does not exist`,
	null
>;

/** Column-level actions on a column map. */
type ColAction<Tbl, A, TN extends string> = A extends {
	readonly t: "add_column";
	readonly ifNotExists: infer Ine;
	readonly col: infer D extends ColumnDef;
}
	? D["name"] extends keyof Tbl
		? Ine extends true
			? Tbl
			: SqlError<
					`column "${D["name"]}" of relation "${TN}" already exists`,
					null
				>
		: SetKey<Tbl, D["name"], DescOf<D>>
	: A extends {
				readonly t: "drop_column";
				readonly ifExists: infer Ife;
				readonly name: infer C extends string;
			}
		? C extends keyof Tbl
			? DelKey<Tbl, C>
			: Ife extends true
				? Tbl
				: NoColumn<C, TN>
		: A extends { readonly t: "add_pk"; readonly cols: infer Cs }
			? FirstMissing<Cs, Tbl> extends infer M extends string
				? NoColumn<M, TN>
				: Cs extends readonly string[]
					? Rebuild<{
							[K in keyof Tbl]: K extends Cs[number]
								? WithNullable<Tbl[K], false>
								: Tbl[K];
						}>
					: Tbl
			: A extends {
						readonly t: infer Kind;
						readonly name: infer C extends string;
					}
				? C extends keyof Tbl
					? ModifyCol<Tbl[C], Kind, A, C, TN> extends infer D2
						? D2 extends AnyErr
							? D2
							: SetKey<Tbl, C, D2>
						: never
					: NoColumn<C, TN>
				: Tbl;

type ModifyCol<
	D,
	Kind,
	A,
	C extends string,
	TN extends string,
> = Kind extends "alter_type"
	? A extends { readonly type: infer Ty extends string }
		? WithType<D, Ty>
		: D
	: Kind extends "set_not_null"
		? WithNullable<D, false>
		: Kind extends "drop_not_null"
			? WithNullable<D, true>
			: Kind extends "set_default"
				? WithDefault<D, true>
				: Kind extends "drop_default"
					? WithDefault<D, false>
					: Kind extends "add_identity"
						? NullOf<D> extends true
							? SqlError<
									`column "${C}" of relation "${TN}" must be declared NOT NULL before identity can be added`,
									null
								>
							: WithDefault<D, true>
						: D;

// ───────────────────────────── views ─────────────────────────────

type ApplyCreateView<
	DB,
	OrR,
	Mat,
	Ine,
	Ref extends TableRef,
	Names,
	Q,
	QDB = DB,
> =
	GetRel<DB, Ref> extends infer Rel
		? Rel extends null
			? CanCreate<DB, Ref> extends infer E
				? E extends AnyErr
					? E
					: BuildView<DB, Ref, Names, Q, null, QDB>
				: never
			: Ine extends true
				? DB
				: OrR extends true
					? IsViewVal<Rel> extends true
						? BuildView<DB, Ref, Names, Q, ColsOf<Rel>, QDB>
						: SqlError<`"${Display<Ref>}" is not a view`, null>
					: SqlError<`relation "${Ref["name"]}" already exists`, null>
		: never;

/** `QDB`: the schema the query is checked against (inside CREATE SCHEMA, the new schema comes first). */
type BuildView<DB, Ref extends TableRef, Names, Q, Old, QDB = DB> =
	QueryCols<
		QDB,
		Q,
		Names,
		"CREATE VIEW specifies more column names than columns"
	> extends infer M
		? M extends AnyErr
			? M
			: ViewTable<M> extends infer V
				? (Old extends null ? null : CheckReplace<Old, V>) extends infer E
					? E extends AnyErr
						? E
						: PutRel<DB, Ref, AsView<V>>
					: never
				: never
		: never;

/** CREATE OR REPLACE VIEW may add columns, but not drop columns or change their types. */
type CheckReplace<Old, New> = [Exclude<keyof Old, keyof New>] extends [never]
	? PickOne<TypeConflict<Old, New>> extends infer K
		? [K] extends [never]
			? null
			: K extends keyof Old & keyof New
				? SqlError<
						`cannot change data type of view column "${K & string}" from ${DisplayType<TypeOfCol<Old[K]>>} to ${DisplayType<TypeOfCol<New[K]>>}`,
						null
					>
				: null
		: never
	: SqlError<"cannot drop columns from view", null>;

// ───────────────────────────── enums ─────────────────────────────

type Types<DB> = DB extends { readonly $types: infer R } ? R : {};

/** Top-level keys that hold registries, not tables or schemas. */
type MetaKey = "$types" | "$functions";

type Fns<DB> = DB extends { readonly $functions: infer F } ? F : {};
/** CREATE [OR REPLACE] FUNCTION: register (or replace) `$functions[name]`; arguments are not checked. */
type ApplyCreateFunction<
	DB,
	Name extends string,
	Ret extends string,
	Srf,
> = SetKey<
	DB,
	"$functions",
	SetKey<
		Fns<DB>,
		Name,
		Srf extends true ? Sig<["..."], Ret, { srf: true }> : Sig<["..."], Ret>
	>
>;

type ApplyCreateEnum<DB, Name extends string, Vs extends readonly string[]> =
	Types<DB> extends infer R
		? Name extends keyof R
			? SqlError<`type "${Name}" already exists`, null>
			: SetKey<DB, "$types", SetKey<R, Name, Vs[number]>>
		: never;

type ApplyAlterEnum<DB, Name extends string, Act> =
	Types<DB> extends infer R
		? Name extends keyof R
			? Act extends {
					readonly t: "add_value";
					readonly value: infer V extends string;
					readonly ifNotExists: infer Ine;
				}
				? V extends R[Name]
					? Ine extends true
						? DB
						: SqlError<`enum label "${V}" already exists`, null>
					: SetKey<DB, "$types", SetKey<R, Name, R[Name] | V>>
				: Act extends {
							readonly t: "rename_value";
							readonly from: infer F extends string;
							readonly to: infer To extends string;
						}
					? F extends R[Name]
						? To extends R[Name]
							? SqlError<`enum label "${To}" already exists`, null>
							: SetKey<DB, "$types", SetKey<R, Name, Exclude<R[Name], F> | To>>
						: SqlError<`"${F}" is not an existing enum label`, null>
					: Act extends {
								readonly t: "rename";
								readonly to: infer To extends string;
							}
						? To extends keyof R
							? SqlError<`type "${To}" already exists`, null>
							: RetypeDeep<DB, Name, To>
						: DB
			: SqlError<`type "${Name}" does not exist`, null>
		: never;
/** Rename the registry entry and every column typed `F` / `F[]`, in tables, views and nested schemas. */
type RetypeDeep<DB, F extends string, To extends string> = Rebuild<{
	[K in keyof DB]: K extends "$types"
		? RenameKey<DB[K], F, To>
		: K extends "$functions"
			? DB[K]
			: DB[K] extends { readonly $view: infer C }
				? AsView<RetypeCols<C, F, To>>
				: IsNamespace<DB[K]> extends true
					? RetypeNs<DB[K], F, To>
					: RetypeCols<DB[K], F, To>;
}>;
type RetypeNs<NS, F extends string, To extends string> = Rebuild<{
	[K in keyof NS]: NS[K] extends { readonly $view: infer C }
		? AsView<RetypeCols<C, F, To>>
		: RetypeCols<NS[K], F, To>;
}>;
type RetypeCols<Tbl, F extends string, To extends string> = Rebuild<{
	[K in keyof Tbl]: TypeOfCol<Tbl[K]> extends F
		? WithType<Tbl[K], To>
		: TypeOfCol<Tbl[K]> extends `${F}[]`
			? WithType<Tbl[K], `${To}[]`>
			: Tbl[K];
}>;

type ApplyDropTypes<DB, Refs, Ife, Casc> = Refs extends readonly [
	infer N extends TableRef,
	...infer Rest,
]
	? Types<DB> extends infer R
		? N["name"] extends keyof R
			? UsesType<DB, N["name"]> extends true
				? Casc extends true
					? ApplyDropTypes<DropTypeCols<DB, N["name"]>, Rest, Ife, Casc>
					: SqlError<
							`cannot drop type ${N["name"]} because other objects depend on it`,
							null
						>
				: ApplyDropTypes<
						SetKey<DB, "$types", DelKey<R, N["name"]>>,
						Rest,
						Ife,
						Casc
					>
			: Ife extends true
				? ApplyDropTypes<DB, Rest, Ife, Casc>
				: SqlError<`type "${N["name"]}" does not exist`, null>
		: never
	: DB;

type ColUses<C, N extends string> =
	TypeOfCol<C> extends N | `${N}[]` ? true : false;
type TblUses<Tbl, N extends string> = true extends {
	[C in keyof Tbl]: ColUses<Tbl[C], N>;
}[keyof Tbl]
	? true
	: false;
type UsesType<DB, N extends string> = true extends {
	[K in keyof DB]: K extends MetaKey
		? false
		: IsNamespace<DB[K]> extends true
			? NsUses<DB[K], N>
			: TblUses<ColsOf<DB[K]>, N>;
}[keyof DB]
	? true
	: false;
type NsUses<NS, N extends string> = true extends {
	[K in keyof NS]: TblUses<ColsOf<NS[K]>, N>;
}[keyof NS]
	? true
	: false;

/** `DROP TYPE ... CASCADE`: drop the registry entry, dependent table columns, and dependent views. */
type DropTypeCols<DB, N extends string> = Rebuild<{
	[K in keyof DB as K extends MetaKey
		? K
		: IsViewVal<DB[K]> extends true
			? TblUses<ColsOf<DB[K]>, N> extends true
				? never
				: K
			: K]: K extends "$types"
		? DelKey<DB[K], N>
		: K extends "$functions"
			? DB[K]
			: IsViewVal<DB[K]> extends true
				? DB[K]
				: IsNamespace<DB[K]> extends true
					? DropTypeNs<DB[K], N>
					: StripCols<DB[K], N>;
}>;
type DropTypeNs<NS, N extends string> = Rebuild<{
	[K in keyof NS as IsViewVal<NS[K]> extends true
		? TblUses<ColsOf<NS[K]>, N> extends true
			? never
			: K
		: K]: IsViewVal<NS[K]> extends true ? NS[K] : StripCols<NS[K], N>;
}>;
type StripCols<Tbl, N extends string> = Rebuild<{
	[K in keyof Tbl as ColUses<Tbl[K], N> extends true ? never : K]: Tbl[K];
}>;

// ───────────────────────────── schemas ─────────────────────────────

type ApplyCreateSchema<DB, Ine, Name extends string> = Name extends "public"
	? Ine extends true
		? DB
		: SqlError<`schema "public" already exists`, null>
	: Name extends keyof DB
		? IsSchemaKey<DB, Name> extends true
			? Ine extends true
				? DB
				: SqlError<`schema "${Name}" already exists`, null>
			: SqlError<
					`cannot create schema "${Name}": a relation with that name exists (TypeSQL keeps schemas and public relations in one object)`,
					null
				>
		: SetKey<DB, Name, {}>;

/**
 * Elements of CREATE SCHEMA (tables, then views; already named in schema `S`). Postgres runs them with
 * `S` first in the search path: unqualified INHERITS / LIKE parents and view queries see `S`'s relations
 * before public ones.
 */
type ApplyElements<DB, S extends string, Els> = Els extends readonly [
	infer E,
	...infer R,
]
	? (
			E extends {
				readonly t: "create_table";
				readonly ifNotExists: infer Ine;
				readonly table: infer Ref extends TableRef;
				readonly columns: infer Defs;
				readonly constraints: infer Cons;
				readonly like: infer Likes;
				readonly inherits: infer Inh;
				readonly of: infer Of;
			}
				? Of extends TableRef
					? ApplyTypedTable<DB, Ine, Ref, Of>
					: ApplyCreateTable<
							DB,
							Ine,
							Ref,
							Defs,
							Cons,
							InSearchPath<DB, S, Likes>,
							InSearchPath<DB, S, Inh>
						>
				: E extends {
							readonly t: "create_view";
							readonly orReplace: infer OrR;
							readonly materialized: infer Mat;
							readonly ifNotExists: infer Ine;
							readonly view: infer Ref extends TableRef;
							readonly cols: infer Names;
							readonly q: infer Q;
						}
					? ApplyCreateView<
							DB,
							OrR,
							Mat,
							Ine,
							Ref,
							Names,
							Q,
							S extends keyof DB ? ApplyPatch<DB, DB[S], never> : DB
						>
					: DB
		) extends infer DB2
		? DB2 extends AnyErr
			? DB2
			: ApplyElements<DB2, S, R>
		: never
	: DB;
/** Unqualified relation names (TableRef or LIKE clause entries) that exist in schema `S`, qualified with `S`. */
type InSearchPath<DB, S extends string, Items> = {
	[K in keyof Items]: Items[K] extends {
		readonly schema: null;
		readonly name: infer N;
	}
		? S extends keyof DB
			? N extends keyof DB[S]
				? { schema: S; name: N }
				: Items[K]
			: Items[K]
		: Items[K] extends {
					readonly ref: { readonly schema: null; readonly name: infer N };
					readonly defaults: infer D;
				}
			? S extends keyof DB
				? N extends keyof DB[S]
					? { ref: { schema: S; name: N }; defaults: D }
					: Items[K]
				: Items[K]
			: Items[K];
};

type ApplyDropSchemas<DB, Names, Ife, Casc> = Names extends readonly [
	infer N extends string,
	...infer Rest,
]
	? N extends "public"
		? SqlError<"DROP SCHEMA public is not supported", null>
		: IsSchemaKey<DB, N> extends true
			? [keyof DB[N & keyof DB]] extends [never]
				? ApplyDropSchemas<DelKey<DB, N>, Rest, Ife, Casc>
				: Casc extends true
					? ApplyDropSchemas<DelKey<DB, N>, Rest, Ife, Casc>
					: SqlError<
							`cannot drop schema ${N} because other objects depend on it`,
							null
						>
			: Ife extends true
				? ApplyDropSchemas<DB, Rest, Ife, Casc>
				: SqlError<`schema "${N}" does not exist`, null>
	: DB;

type ApplyRenameSchema<DB, F extends string, To extends string> =
	IsSchemaKey<DB, F> extends true
		? To extends keyof DB | "public"
			? SqlError<`schema "${To}" already exists`, null>
			: RenameKey<DB, F, To>
		: SqlError<`schema "${F}" does not exist`, null>;
