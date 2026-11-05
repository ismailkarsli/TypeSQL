import type {
	AlterAction,
	ColumnDef,
	ColumnPlace,
	SelectStmt,
	TableRef,
} from "../ast.js";
import type { IsSubqueryParen } from "./expr.js";
import type { ParseSubquery } from "./select.js";
import type { ParseColumnType } from "./typename.js";
import type {
	CloseOk,
	Ident,
	IsOp,
	IsWord,
	Name,
	Nx,
	Ok,
	OptCols,
	SyntaxErr,
	TableRefAt,
	Toks,
} from "./util.js";

type IfNotExists<T extends Toks, I extends number> =
	IsWord<T, I, "if"> extends true
		? IsWord<T, Nx<I>, "not"> extends true
			? IsWord<T, Nx<Nx<I>>, "exists"> extends true
				? [true, Nx<Nx<Nx<I>>>]
				: SyntaxErr<T, Nx<Nx<I>>>
			: SyntaxErr<T, Nx<I>>
		: [false, I];
type IfExists<T extends Toks, I extends number> =
	IsWord<T, I, "if"> extends true
		? IsWord<T, Nx<I>, "exists"> extends true
			? [true, Nx<Nx<I>>]
			: SyntaxErr<T, Nx<I>>
		: [false, I];

/** Skips to the end of the statement. */
export type SkipStatement<
	T extends Toks,
	I extends number,
	What extends string,
> = T[I] extends { readonly k: "o"; readonly v: ";" }
	? Ok<{ t: "noop"; what: What }, I>
	: T[I] extends { readonly k: string }
		? SkipStatement<T, Nx<I>, What>
		: Ok<{ t: "noop"; what: What }, I>;

/** Skips the rest of the input: a stored program body can contain `;`. */
type SkipAll<
	T extends Toks,
	I extends number,
	What extends string,
> = T[I] extends { readonly k: string }
	? SkipAll<T, Nx<I>, What>
	: Ok<{ t: "noop"; what: What }, I>;

/** Skips a parenthesized group starting at `(`; returns the index after `)`. */
type SkipParens<
	T extends Toks,
	I extends number,
	Depth extends readonly unknown[] = [],
> = T[I] extends { readonly k: "o"; readonly v: "(" }
	? SkipParens<T, Nx<I>, [...Depth, 0]>
	: T[I] extends { readonly k: "o"; readonly v: ")" }
		? Depth extends readonly [unknown, ...infer D]
			? D extends readonly []
				? Nx<I>
				: SkipParens<T, Nx<I>, D>
			: SyntaxErr<T, I>
		: T[I] extends { readonly k: string }
			? SkipParens<T, Nx<I>, Depth>
			: SyntaxErr<T, I>;

/** Skips to the `,` or `)` that ends a table element or alter action. */
type SkipItem<T extends Toks, I extends number> = T[I] extends {
	readonly k: "o";
	readonly v: infer O;
}
	? O extends "," | ")" | ";"
		? I
		: O extends "("
			? SkipParens<T, I> extends infer J extends number
				? SkipItem<T, J>
				: SkipParens<T, I>
			: SkipItem<T, Nx<I>>
	: T[I] extends { readonly k: string }
		? SkipItem<T, Nx<I>>
		: I;

export type ParseCreate<T extends Toks, I extends number> = (
	IsWord<T, I, "or"> extends true
		? IsWord<T, Nx<I>, "replace"> extends true
			? [true, Nx<Nx<I>>]
			: SyntaxErr<T, Nx<I>>
		: [false, I]
) extends [infer OrReplace extends boolean, infer I1 extends number]
	? SkipViewOptions<T, I1> extends infer I2 extends number
		? IsWord<T, I2, "view"> extends true
			? ParseCreateView<T, Nx<I2>, OrReplace>
			: (
						IsWord<T, I2, "temporary"> extends true
							? Nx<I2>
							: I2
					) extends infer J extends number
				? IsWord<T, J, "table"> extends true
					? ParseCreateTable<T, Nx<J>>
					: IsWord<T, J, "index"> extends true
						? ParseCreateIndex<T, Nx<J>>
						: IsWord<T, J, "unique" | "fulltext" | "spatial"> extends true
							? IsWord<T, Nx<J>, "index"> extends true
								? ParseCreateIndex<T, Nx<Nx<J>>>
								: SyntaxErr<T, Nx<J>>
							: IsWord<
										T,
										J,
										| "trigger"
										| "procedure"
										| "function"
										| "event"
										| "aggregate"
										| "package"
									> extends true
								? SkipAll<T, J, "routine">
								: IsWord<
											T,
											J,
											| "database"
											| "schema"
											| "user"
											| "role"
											| "sequence"
											| "server"
											| "tablespace"
											| "logfile"
											| "resource"
											| "spatial"
										> extends true
									? SkipStatement<T, J, "create">
									: SyntaxErr<T, J>
				: never
		: SkipViewOptions<T, I1>
	: never;

/** `ALGORITHM = x`, `DEFINER = user`, `SQL SECURITY x` before VIEW (or a routine). */
type SkipViewOptions<T extends Toks, I extends number> = T[I] extends {
	readonly k: "w";
	readonly v: infer W;
}
	? W extends "algorithm" | "definer"
		? IsOp<T, Nx<I>, "="> extends true
			? SkipDefinerValue<T, Nx<Nx<I>>>
			: SyntaxErr<T, Nx<I>>
		: W extends "sql"
			? IsWord<T, Nx<I>, "security"> extends true
				? SkipViewOptions<T, Nx<Nx<Nx<I>>>>
				: SyntaxErr<T, Nx<I>>
			: I
	: I;
/** `user`, `'user'@'host'`, `current_user[()]`. */
type SkipDefinerValue<T extends Toks, I extends number> = T[Nx<I>] extends {
	readonly k: "v";
}
	? SkipViewOptions<T, Nx<Nx<I>>>
	: IsOp<T, Nx<I>, "("> extends true
		? IsOp<T, Nx<Nx<I>>, ")"> extends true
			? SkipViewOptions<T, Nx<Nx<Nx<I>>>>
			: SkipViewOptions<T, Nx<I>>
		: SkipViewOptions<T, Nx<I>>;

type ParseCreateTable<T extends Toks, I extends number> =
	IfNotExists<T, I> extends [infer Ine extends boolean, infer J extends number]
		? TableRefAt<T, J> extends Ok<
				infer Table extends TableRef,
				infer J2 extends number
			>
			? IsWord<T, J2, "like"> extends true
				? CreateLike<T, Nx<J2>, Ine, Table>
				: IsOp<T, J2, "("> extends true
					? IsWord<T, Nx<J2>, "like"> extends true
						? CreateLike<T, Nx<Nx<J2>>, Ine, Table> extends Ok<
								infer S,
								infer J3 extends number
							>
							? CloseOk<T, J3, S>
							: CreateLike<T, Nx<Nx<J2>>, Ine, Table>
						: IsSubqueryParen<T, Nx<J2>> extends true
							? CtasQuery<T, J2, Ine, Table, []>
							: TableElements<T, Nx<J2>, [], []> extends Ok<
										[
											infer Cols extends readonly ColumnDef[],
											infer Pk extends readonly string[],
										],
										infer J3 extends number
									>
								? SkipTableOptions<T, J3> extends infer J4 extends number
									? AtQuery<T, J4> extends true
										? CtasQuery<T, J4, Ine, Table, ApplyPk<Cols, Pk>>
										: Ok<
												{
													t: "create_table";
													ifNotExists: Ine;
													table: Table;
													columns: Cols;
													pk: Pk;
												},
												J4
											>
									: never
								: TableElements<T, Nx<J2>, [], []>
					: SkipTableOptions<T, J2> extends infer J3 extends number
						? AtQuery<T, J3> extends true
							? CtasQuery<T, J3, Ine, Table, []>
							: SyntaxErr<T, J3>
						: never
			: TableRefAt<T, J>
		: IfNotExists<T, I>;

/** `CREATE TABLE t LIKE src`, with `src` at `I`. */
type CreateLike<
	T extends Toks,
	I extends number,
	Ine extends boolean,
	Table extends TableRef,
> =
	TableRefAt<T, I> extends Ok<infer Like, infer J extends number>
		? Ok<
				{ t: "create_table_like"; ifNotExists: Ine; table: Table; like: Like },
				J
			>
		: TableRefAt<T, I>;

type AtQuery<T extends Toks, I extends number> =
	IsWord<
		T,
		I,
		"as" | "select" | "with" | "ignore" | "replace" | "table"
	> extends true
		? true
		: IsOp<T, I, "(">;

type CtasQuery<
	T extends Toks,
	I extends number,
	Ine extends boolean,
	Table,
	Cols extends readonly ColumnDef[],
> = (
	IsWord<T, I, "ignore" | "replace"> extends true
		? Nx<I>
		: I
) extends infer J extends number
	? (IsWord<T, J, "as"> extends true ? Nx<J> : J) extends infer J2 extends
			number
		? ParseSubquery<T, J2> extends Ok<
				infer S extends SelectStmt,
				infer J3 extends number
			>
			? Ok<
					{
						t: "create_table_as";
						ifNotExists: Ine;
						table: Table;
						columns: Cols;
						q: S;
					},
					J3
				>
			: ParseSubquery<T, J2>
		: never
	: never;

/** Table options after the column list: `ENGINE=InnoDB DEFAULT CHARSET=…`, partitioning, … */
type SkipTableOptions<T extends Toks, I extends number> =
	AtQuery<T, I> extends true
		? I
		: T[I] extends { readonly k: "o"; readonly v: ";" }
			? I
			: T[I] extends { readonly k: "o"; readonly v: "(" }
				? SkipParens<T, I> extends infer J extends number
					? SkipTableOptions<T, J>
					: I
				: T[I] extends { readonly k: string }
					? SkipTableOptions<T, Nx<I>>
					: I;

type ApplyPk<
	Cols extends readonly ColumnDef[],
	Pk extends readonly string[],
> = {
	[K in keyof Cols]: Lowercase<Cols[K]["name"]> extends Pk[number]
		? Omit<Cols[K], "primaryKey"> & { readonly primaryKey: true }
		: Cols[K];
};

type TableElements<
	T extends Toks,
	I extends number,
	Cols extends readonly ColumnDef[],
	Pk extends readonly string[],
> =
	TableElement<T, I> extends Ok<
		[infer C2 extends readonly ColumnDef[], infer P2 extends readonly string[]],
		infer J extends number
	>
		? IsOp<T, J, ","> extends true
			? TableElements<T, Nx<J>, [...Cols, ...C2], [...Pk, ...P2]>
			: CloseOk<T, J, [[...Cols, ...C2], [...Pk, ...P2]]>
		: TableElement<T, I>;
/** One column definition or constraint: its columns and primary key names. */
type TableElement<T extends Toks, I extends number> =
	IsConstraintStart<T, I> extends true
		? TableConstraint<T, I>
		: ParseColumnDef<T, I> extends Ok<infer Col, infer J extends number>
			? Ok<[[Col], []], J>
			: ParseColumnDef<T, I>;

type IsConstraintStart<T extends Toks, I extends number> =
	IsWord<
		T,
		I,
		| "constraint"
		| "primary"
		| "unique"
		| "foreign"
		| "check"
		| "index"
		| "key"
		| "fulltext"
		| "spatial"
		| "period"
	> extends true
		? IsOp<T, Nx<I>, "."> extends true
			? false
			: true
		: false;

/** A table constraint or index: only `PRIMARY KEY (…)` changes the columns. */
type TableConstraint<T extends Toks, I extends number> = (
	IsWord<T, I, "constraint"> extends true
		? IsWord<T, Nx<I>, "primary" | "unique" | "foreign" | "check"> extends true
			? Nx<I>
			: Nx<Nx<I>>
		: I
) extends infer J extends number
	? IsWord<T, J, "primary"> extends true
		? IsWord<T, Nx<J>, "key"> extends true
			? KeyParts<T, Nx<Nx<J>>> extends Ok<
					infer Cols extends readonly string[],
					infer J2 extends number
				>
				? Ok<[[], Cols], SkipItem<T, J2>>
				: KeyParts<T, Nx<Nx<J>>>
			: SyntaxErr<T, Nx<J>>
		: Ok<[[], []], SkipItem<T, J>>
	: never;

/** `[USING BTREE] (a, b(10) DESC, (expr))`: the plain column names. */
type KeyParts<T extends Toks, I extends number> =
	IsOp<T, I, "("> extends true
		? KeyPartLoop<T, Nx<I>, []>
		: T[I] extends { readonly k: "w" | "id" }
			? KeyParts<T, Nx<I>>
			: SyntaxErr<T, I>;
type KeyPartLoop<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
> =
	KeyPart<T, I> extends [infer C extends readonly string[], infer J]
		? J extends number
			? IsOp<T, J, ","> extends true
				? KeyPartLoop<T, Nx<J>, [...Acc, ...C]>
				: CloseOk<T, J, [...Acc, ...C]>
			: J
		: KeyPart<T, I>;
type KeyPart<T extends Toks, I extends number> =
	Ident<T, I> extends infer N extends Name
		? [[N["v"]], SkipKeyPart<T, Nx<I>>]
		: IsOp<T, I, "("> extends true
			? [[], SkipKeyPart<T, I>]
			: SyntaxErr<T, I>;
type SkipKeyPart<T extends Toks, I extends number> = T[I] extends {
	readonly k: "o";
	readonly v: infer O;
}
	? O extends "," | ")"
		? I
		: O extends "("
			? SkipParens<T, I> extends infer J extends number
				? SkipKeyPart<T, J>
				: SkipParens<T, I>
			: SyntaxErr<T, I>
	: T[I] extends { readonly k: "w"; readonly v: "asc" | "desc" }
		? SkipKeyPart<T, Nx<I>>
		: SyntaxErr<T, I>;

type ColState = {
	readonly notNull: boolean | null;
	readonly hasDefault: boolean;
	readonly autoInc: boolean;
	readonly generated: boolean;
	readonly primaryKey: boolean;
	readonly invisible: boolean;
};
type Init = {
	readonly notNull: null;
	readonly hasDefault: false;
	readonly autoInc: false;
	readonly generated: false;
	readonly primaryKey: false;
	readonly invisible: false;
};
type With<S extends ColState, K extends keyof ColState, V> = {
	readonly [P in keyof ColState]: P extends K ? V : S[P];
};
/** `SERIAL`: `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE`. */
type SerialInit = With<
	With<With<Init, "notNull", true>, "autoInc", true>,
	"hasDefault",
	true
>;

type ParseColumnDef<T extends Toks, I extends number> =
	Ident<T, I> extends infer N extends Name
		? ParseColumnType<T, Nx<I>> extends Ok<
				{
					readonly type: infer Ty extends string;
					readonly enumValues: infer Ev;
				},
				infer J extends number
			>
			? ColumnAttrs<T, J, Ty extends "serial" ? SerialInit : Init> extends Ok<
					infer S extends ColState,
					infer J2 extends number
				>
				? Ok<
						{
							name: N["n"];
							type: Ty extends "serial" ? "bigint unsigned" : Ty;
							notNull: S["notNull"];
							hasDefault: S["hasDefault"];
							autoInc: S["autoInc"];
							generated: S["generated"];
							primaryKey: S["primaryKey"];
							invisible: S["invisible"];
							enumValues: [Ev] extends [never] ? null : Ev;
						},
						J2
					>
				: ColumnAttrs<T, J, Ty extends "serial" ? SerialInit : Init>
			: ParseColumnType<T, Nx<I>>
		: SyntaxErr<T, I>;

type ColumnAttrs<
	T extends Toks,
	I extends number,
	S extends ColState,
> = T[I] extends { readonly k: "w"; readonly v: infer W extends string }
	? W extends "not"
		? IsWord<T, Nx<I>, "null"> extends true
			? ColumnAttrs<T, Nx<Nx<I>>, With<S, "notNull", true>>
			: SyntaxErr<T, Nx<I>>
		: W extends "null"
			? ColumnAttrs<
					T,
					Nx<I>,
					With<S, "notNull", S["primaryKey"] extends true ? true : false>
				>
			: W extends "default"
				? AttrsAt<T, SkipDefault<T, Nx<I>>, With<S, "hasDefault", true>>
				: W extends "auto_increment"
					? ColumnAttrs<
							T,
							Nx<I>,
							With<With<S, "autoInc", true>, "hasDefault", true>
						>
					: W extends "primary"
						? IsWord<T, Nx<I>, "key"> extends true
							? ColumnAttrs<T, Nx<Nx<I>>, With<S, "primaryKey", true>>
							: SyntaxErr<T, Nx<I>>
						: W extends "key"
							? ColumnAttrs<T, Nx<I>, With<S, "primaryKey", true>>
							: W extends "unique"
								? ColumnAttrs<
										T,
										IsWord<T, Nx<I>, "key"> extends true ? Nx<Nx<I>> : Nx<I>,
										S
									>
								: W extends "generated"
									? IsWord<T, Nx<I>, "always"> extends true
										? IsWord<T, Nx<Nx<I>>, "as"> extends true
											? Generated<T, Nx<Nx<Nx<I>>>, S>
											: SyntaxErr<T, Nx<Nx<I>>>
										: SyntaxErr<T, Nx<I>>
									: W extends "as"
										? Generated<T, Nx<I>, S>
										: W extends "invisible"
											? ColumnAttrs<T, Nx<I>, With<S, "invisible", true>>
											: W extends
														| "visible"
														| "virtual"
														| "stored"
														| "persistent"
														| "binary"
														| "ascii"
														| "unicode"
														| "byte"
														| "unsigned"
														| "signed"
														| "zerofill"
												? ColumnAttrs<T, Nx<I>, S>
												: W extends
															| "comment"
															| "collate"
															| "charset"
															| "column_format"
															| "storage"
															| "srid"
															| "engine_attribute"
															| "secondary_engine_attribute"
															| "compressed"
													? ColumnAttrs<
															T,
															IsOp<T, Nx<I>, "="> extends true
																? Nx<Nx<Nx<I>>>
																: Nx<Nx<I>>,
															S
														>
													: W extends "character"
														? IsWord<T, Nx<I>, "set"> extends true
															? ColumnAttrs<T, Nx<Nx<Nx<I>>>, S>
															: SyntaxErr<T, Nx<I>>
														: W extends "on"
															? IsWord<T, Nx<I>, "update"> extends true
																? AttrsAt<T, SkipCallable<T, Nx<Nx<I>>>, S>
																: SyntaxErr<T, Nx<I>>
															: W extends "references"
																? TableRefAt<T, Nx<I>> extends Ok<
																		unknown,
																		infer J extends number
																	>
																	? SkipReference<
																			T,
																			IsOp<T, J, "("> extends true
																				? SkipParens<T, J>
																				: J,
																			S
																		>
																	: SyntaxErr<T, Nx<I>>
																: W extends "constraint"
																	? ColumnAttrs<
																			T,
																			IsWord<T, Nx<I>, "check"> extends true
																				? Nx<I>
																				: Nx<Nx<I>>,
																			S
																		>
																	: W extends "check"
																		? IsOp<T, Nx<I>, "("> extends true
																			? SkipParens<
																					T,
																					Nx<I>
																				> extends infer J extends number
																				? ColumnAttrs<T, SkipEnforced<T, J>, S>
																				: SkipParens<T, Nx<I>>
																			: SyntaxErr<T, Nx<I>>
																		: Ok<S, I>
	: T[I] extends { readonly k: "o"; readonly v: "," | ")" | ";" }
		? Ok<S, I>
		: T[I] extends { readonly k: string }
			? SyntaxErr<T, I>
			: Ok<S, I>;
/** Continues the attributes at `J`, or passes a skip's error through. */
type AttrsAt<T extends Toks, J, S extends ColState> = J extends number
	? ColumnAttrs<T, J, S>
	: J;

type SkipEnforced<T extends Toks, I extends number> =
	IsWord<T, I, "enforced"> extends true
		? Nx<I>
		: IsWord<T, I, "not"> extends true
			? IsWord<T, Nx<I>, "enforced"> extends true
				? Nx<Nx<I>>
				: I
			: I;

/** `REFERENCES t (a) [MATCH x] [ON DELETE action] [ON UPDATE action]`. */
type SkipReference<T extends Toks, I, S extends ColState> = I extends number
	? IsWord<T, I, "match"> extends true
		? SkipReference<T, Nx<Nx<I>>, S>
		: IsWord<T, I, "on"> extends true
			? IsWord<T, Nx<I>, "delete" | "update"> extends true
				? IsWord<T, Nx<Nx<I>>, "set" | "no"> extends true
					? SkipReference<T, Nx<Nx<Nx<Nx<I>>>>, S>
					: SkipReference<T, Nx<Nx<Nx<I>>>, S>
				: ColumnAttrs<T, I, S>
			: ColumnAttrs<T, I, S>
	: I;

type Generated<T extends Toks, I extends number, S extends ColState> =
	IsOp<T, I, "("> extends true
		? AttrsAt<
				T,
				SkipParens<T, I>,
				With<With<S, "generated", true>, "hasDefault", true>
			>
		: SyntaxErr<T, I>;

/** A default: a literal, `-1`, `(expr)`, `CURRENT_TIMESTAMP[(n)]`, `NULL`. */
type SkipDefault<T extends Toks, I extends number> =
	IsOp<T, I, "("> extends true
		? SkipParens<T, I>
		: IsOp<T, I, "-" | "+"> extends true
			? T[Nx<I>] extends { readonly k: "n" }
				? Nx<Nx<I>>
				: SyntaxErr<T, Nx<I>>
			: T[I] extends { readonly k: "n" | "s" }
				? Nx<I>
				: T[I] extends { readonly k: "w" }
					? SkipCallable<T, I>
					: SyntaxErr<T, I>;
type SkipCallable<T extends Toks, I extends number> = T[I] extends {
	readonly k: "w";
}
	? IsOp<T, Nx<I>, "("> extends true
		? SkipParens<T, Nx<I>>
		: T[Nx<I>] extends { readonly k: "s" }
			? Nx<Nx<I>>
			: Nx<I>
	: SyntaxErr<T, I>;

type ParseCreateView<
	T extends Toks,
	I extends number,
	OrReplace extends boolean,
> =
	IfNotExists<T, I> extends [infer Ine extends boolean, infer J extends number]
		? TableRefAt<T, J> extends Ok<infer View, infer J2 extends number>
			? OptCols<T, J2> extends Ok<infer Cols, infer J3 extends number>
				? IsWord<T, J3, "as"> extends true
					? ParseSubquery<T, Nx<J3>> extends Ok<
							infer S extends SelectStmt,
							infer J4 extends number
						>
						? Ok<
								{
									t: "create_view";
									orReplace: OrReplace;
									ifNotExists: Ine;
									view: View;
									cols: Cols extends readonly Name[] ? Cols : null;
									q: S;
								},
								SkipCheckOption<T, J4>
							>
						: ParseSubquery<T, Nx<J3>>
					: SyntaxErr<T, J3>
				: OptCols<T, J2>
			: TableRefAt<T, J>
		: IfNotExists<T, I>;

type SkipCheckOption<T extends Toks, I extends number> =
	IsWord<T, I, "with"> extends true
		? (
				IsWord<T, Nx<I>, "cascaded" | "local"> extends true
					? Nx<Nx<I>>
					: Nx<I>
			) extends infer J extends number
			? IsWord<T, J, "check"> extends true
				? IsWord<T, Nx<J>, "option"> extends true
					? Nx<Nx<J>>
					: I
				: I
			: I
		: I;

/** `CREATE INDEX name [USING x] ON t (…)`: checks the table exists. */
type ParseCreateIndex<T extends Toks, I extends number> =
	IfNotExists<T, I> extends [boolean, infer I0 extends number]
		? Ident<T, I0> extends Name
			? (
					IsWord<T, Nx<I0>, "using"> extends true
						? Nx<Nx<Nx<I0>>>
						: Nx<I0>
				) extends infer J extends number
				? IsWord<T, J, "on"> extends true
					? TableRefAt<T, Nx<J>> extends Ok<
							infer Table,
							infer J2 extends number
						>
						? IsOp<T, J2, "("> extends true
							? SkipStatement<T, J2, "index"> extends Ok<
									unknown,
									infer J3 extends number
								>
								? Ok<{ t: "create_index"; table: Table }, J3>
								: never
							: SyntaxErr<T, J2>
						: TableRefAt<T, Nx<J>>
					: SyntaxErr<T, J>
				: never
			: SyntaxErr<T, I0>
		: IfNotExists<T, I>;

export type ParseDrop<T extends Toks, I extends number> = (
	IsWord<T, I, "temporary"> extends true
		? Nx<I>
		: I
) extends infer J extends number
	? T[J] extends {
			readonly k: "w";
			readonly v: infer K extends "table" | "view" | "tables";
		}
		? IfExists<T, Nx<J>> extends [
				infer Ie extends boolean,
				infer J2 extends number,
			]
			? DropNames<T, J2, []> extends Ok<infer Names, infer J3 extends number>
				? Ok<
						{
							t: "drop";
							kind: K extends "view" ? "view" : "table";
							ifExists: Ie;
							names: Names;
						},
						IsWord<T, J3, "restrict" | "cascade"> extends true ? Nx<J3> : J3
					>
				: DropNames<T, J2, []>
			: IfExists<T, Nx<J>>
		: IsWord<T, J, "index" | "key"> extends true
			? ParseDropIndex<T, Nx<J>>
			: SkipStatement<T, J, "drop">
	: never;

type DropNames<
	T extends Toks,
	I extends number,
	Acc extends readonly TableRef[],
> =
	TableRefAt<T, I> extends Ok<
		infer Ref extends TableRef,
		infer J extends number
	>
		? IsOp<T, J, ","> extends true
			? DropNames<T, Nx<J>, [...Acc, Ref]>
			: Ok<[...Acc, Ref], J>
		: TableRefAt<T, I>;

type ParseDropIndex<T extends Toks, I extends number> =
	IfExists<T, I> extends [boolean, infer I0 extends number]
		? Ident<T, I0> extends Name
			? IsWord<T, Nx<I0>, "on"> extends true
				? TableRefAt<T, Nx<Nx<I0>>> extends Ok<
						infer Table,
						infer J extends number
					>
					? SkipStatement<T, J, "index"> extends Ok<
							unknown,
							infer J2 extends number
						>
						? Ok<{ t: "drop_index"; table: Table }, J2>
						: never
					: TableRefAt<T, Nx<Nx<I0>>>
				: SyntaxErr<T, Nx<I0>>
			: SyntaxErr<T, I0>
		: IfExists<T, I>;

export type ParseRename<T extends Toks, I extends number> =
	IsWord<T, I, "table" | "tables"> extends true
		? RenamePairs<T, Nx<I>, []>
		: SkipStatement<T, I, "rename">;
type RenamePairs<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	TableRefAt<T, I> extends Ok<infer From, infer J extends number>
		? IsWord<T, J, "to"> extends true
			? TableRefAt<T, Nx<J>> extends Ok<infer To, infer J2 extends number>
				? IsOp<T, J2, ","> extends true
					? RenamePairs<T, Nx<J2>, [...Acc, { from: From; to: To }]>
					: Ok<
							{
								t: "rename_table";
								pairs: [...Acc, { from: From; to: To }];
							},
							J2
						>
				: TableRefAt<T, Nx<J>>
			: SyntaxErr<T, J>
		: TableRefAt<T, I>;

export type ParseTruncate<T extends Toks, I extends number> = (
	IsWord<T, I, "table"> extends true
		? Nx<I>
		: I
) extends infer J extends number
	? TableRefAt<T, J> extends Ok<infer Table, infer J2 extends number>
		? Ok<{ t: "truncate"; table: Table }, J2>
		: TableRefAt<T, J>
	: never;

export type ParseAlter<T extends Toks, I extends number> = (
	IsWord<T, I, "online" | "ignore"> extends true
		? Nx<I>
		: I
) extends infer I1 extends number
	? IsWord<T, I1, "table"> extends true
		? IfExists<T, Nx<I1>> extends [boolean, infer J extends number]
			? TableRefAt<T, J> extends Ok<infer Table, infer J2 extends number>
				? AlterActions<T, J2, []> extends Ok<
						infer Actions,
						infer J3 extends number
					>
					? Ok<{ t: "alter_table"; table: Table; actions: Actions }, J3>
					: AlterActions<T, J2, []>
				: TableRefAt<T, J>
			: IfExists<T, Nx<I1>>
		: SkipViewOptions<T, I1> extends infer I2 extends number
			? IsWord<T, I2, "view"> extends true
				? ParseCreateView<T, Nx<I2>, true>
				: SkipStatement<T, I1, "alter">
			: SkipViewOptions<T, I1>
	: never;

type AlterActions<
	T extends Toks,
	I extends number,
	Acc extends readonly AlterAction[],
> = T[I] extends { readonly k: string }
	? T[I] extends { readonly k: "o"; readonly v: ";" }
		? Ok<Acc, I>
		: AlterAction_<T, I> extends Ok<
					infer As extends readonly AlterAction[],
					infer J extends number
				>
			? IsOp<T, J, ","> extends true
				? AlterActions<T, Nx<J>, [...Acc, ...As]>
				: Ok<[...Acc, ...As], J>
			: AlterAction_<T, I>
	: Ok<Acc, I>;

type Place<T extends Toks, I extends number> =
	IsWord<T, I, "first"> extends true
		? Ok<{ t: "first" }, Nx<I>>
		: IsWord<T, I, "after"> extends true
			? Ident<T, Nx<I>> extends infer N extends Name
				? Ok<{ t: "after"; col: N["v"] }, Nx<Nx<I>>>
				: SyntaxErr<T, Nx<I>>
			: Ok<null, I>;

type ColumnWithPlace<T extends Toks, I extends number> =
	ParseColumnDef<T, I> extends Ok<
		infer Col extends ColumnDef,
		infer J extends number
	>
		? Place<T, J> extends Ok<
				infer Pl extends ColumnPlace,
				infer J2 extends number
			>
			? Ok<[Col, Pl], J2>
			: Place<T, J>
		: ParseColumnDef<T, I>;

type SkipColumn<T extends Toks, I extends number> =
	IsWord<T, I, "column"> extends true ? Nx<I> : I;

type AlterAction_<T extends Toks, I extends number> = T[I] extends {
	readonly k: "w";
	readonly v: infer W extends string;
}
	? W extends "add"
		? AddAction<T, Nx<I>>
		: W extends "drop"
			? DropAction<T, Nx<I>>
			: W extends "modify"
				? ChangeAction<T, SkipColumn<T, Nx<I>>, false>
				: W extends "change"
					? ChangeAction<T, SkipColumn<T, Nx<I>>, true>
					: W extends "rename"
						? RenameAction<T, Nx<I>>
						: W extends "alter"
							? AlterColumnAction<T, Nx<I>>
							: Ok<[{ t: "noop" }], SkipItem<T, I>>
	: SyntaxErr<T, I>;

/** `MODIFY [COLUMN] [IF EXISTS] col def` or `CHANGE [COLUMN] [IF EXISTS] old new def`. */
type ChangeAction<T extends Toks, I extends number, Renames extends boolean> =
	IfExists<T, I> extends [boolean, infer J1 extends number]
		? Ident<T, J1> extends infer N extends Name
			? ColumnWithPlace<T, Renames extends true ? Nx<J1> : J1> extends Ok<
					[infer Col, infer Pl],
					infer J2 extends number
				>
				? Ok<[{ t: "change_column"; from: N["v"]; col: Col; place: Pl }], J2>
				: ColumnWithPlace<T, Renames extends true ? Nx<J1> : J1>
			: SyntaxErr<T, J1>
		: IfExists<T, I>;

/** A constraint in ADD: `PRIMARY KEY (…)` adds a key, anything else is a noop. */
type AddConstraint<T extends Toks, I extends number> =
	TableConstraint<T, I> extends Ok<
		[unknown, infer Pk extends readonly string[]],
		infer J extends number
	>
		? Ok<Pk extends readonly [] ? { t: "noop" } : { t: "add_pk"; cols: Pk }, J>
		: TableConstraint<T, I>;

type AddAction<T extends Toks, I extends number> =
	IsConstraintStart<T, I> extends true
		? AddConstraint<T, I> extends Ok<
				infer A extends AlterAction,
				infer J extends number
			>
			? Ok<[A], J>
			: AddConstraint<T, I>
		: SkipColumn<T, I> extends infer J extends number
			? IsOp<T, J, "("> extends true
				? AddColumnList<T, Nx<J>, []>
				: IfNotExists<T, J> extends [
							infer Ine extends boolean,
							infer J1 extends number,
						]
					? ColumnWithPlace<T, J1> extends Ok<
							[infer Col, infer Pl],
							infer J2 extends number
						>
						? Ok<
								[{ t: "add_column"; col: Col; place: Pl; ifNotExists: Ine }],
								J2
							>
						: ColumnWithPlace<T, J1>
					: IfNotExists<T, J>
			: never;
type AddColumnList<
	T extends Toks,
	I extends number,
	Acc extends readonly AlterAction[],
> =
	AddListItem<T, I> extends Ok<
		infer A extends AlterAction,
		infer J extends number
	>
		? IsOp<T, J, ","> extends true
			? AddColumnList<T, Nx<J>, [...Acc, A]>
			: CloseOk<T, J, [...Acc, A]>
		: AddListItem<T, I>;
type AddListItem<T extends Toks, I extends number> =
	IsConstraintStart<T, I> extends true
		? AddConstraint<T, I>
		: ParseColumnDef<T, I> extends Ok<infer Col, infer J extends number>
			? Ok<{ t: "add_column"; col: Col; place: null; ifNotExists: false }, J>
			: ParseColumnDef<T, I>;

type DropAction<T extends Toks, I extends number> =
	IsWord<
		T,
		I,
		| "index"
		| "key"
		| "primary"
		| "foreign"
		| "check"
		| "constraint"
		| "partition"
	> extends true
		? Ok<[{ t: "noop" }], SkipItem<T, I>>
		: SkipColumn<T, I> extends infer J extends number
			? IfExists<T, J> extends [
					infer Ie extends boolean,
					infer J1 extends number,
				]
				? Ident<T, J1> extends infer N extends Name
					? Ok<
							[{ t: "drop_column"; name: N["v"]; ifExists: Ie }],
							IsWord<T, Nx<J1>, "restrict" | "cascade"> extends true
								? Nx<Nx<J1>>
								: Nx<J1>
						>
					: SyntaxErr<T, J1>
				: IfExists<T, J>
			: never;

type RenameAction<T extends Toks, I extends number> =
	IsWord<T, I, "column"> extends true
		? Ident<T, Nx<I>> extends infer A extends Name
			? IsWord<T, Nx<Nx<I>>, "to"> extends true
				? Ident<T, Nx<Nx<Nx<I>>>> extends infer B extends Name
					? Ok<
							[{ t: "rename_column"; from: A["v"]; to: B["n"] }],
							Nx<Nx<Nx<Nx<I>>>>
						>
					: SyntaxErr<T, Nx<Nx<Nx<I>>>>
				: SyntaxErr<T, Nx<Nx<I>>>
			: SyntaxErr<T, Nx<I>>
		: IsWord<T, I, "index" | "key"> extends true
			? Ok<[{ t: "noop" }], SkipItem<T, I>>
			: (
						IsWord<T, I, "to" | "as"> extends true
							? Nx<I>
							: I
					) extends infer J extends number
				? TableRefAt<T, J> extends Ok<infer To, infer J2 extends number>
					? Ok<[{ t: "rename_table"; to: To }], J2>
					: TableRefAt<T, J>
				: never;

type AlterColumnAction<T extends Toks, I extends number> =
	IsWord<T, I, "index" | "check" | "constraint"> extends true
		? Ok<[{ t: "noop" }], SkipItem<T, I>>
		: SkipColumn<T, I> extends infer J extends number
			? Ident<T, J> extends infer N extends Name
				? IsWord<T, Nx<J>, "set"> extends true
					? IsWord<T, Nx<Nx<J>>, "default"> extends true
						? SkipDefault<T, Nx<Nx<Nx<J>>>> extends infer J2 extends number
							? Ok<[{ t: "column_default"; name: N["v"]; has: true }], J2>
							: SkipDefault<T, Nx<Nx<Nx<J>>>>
						: IsWord<T, Nx<Nx<J>>, "visible" | "invisible"> extends true
							? Ok<
									[
										{
											t: "column_visibility";
											name: N["v"];
											invisible: IsWord<T, Nx<Nx<J>>, "invisible">;
										},
									],
									Nx<Nx<Nx<J>>>
								>
							: SyntaxErr<T, Nx<Nx<J>>>
					: IsWord<T, Nx<J>, "drop"> extends true
						? IsWord<T, Nx<Nx<J>>, "default"> extends true
							? Ok<
									[{ t: "column_default"; name: N["v"]; has: false }],
									Nx<Nx<Nx<J>>>
								>
							: SyntaxErr<T, Nx<Nx<J>>>
						: SyntaxErr<T, Nx<J>>
				: SyntaxErr<T, J>
			: never;
