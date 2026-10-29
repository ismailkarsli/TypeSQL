import type { SqlError } from "../../../errors.js";
import type { ColumnDef, Expr, SelectStmt } from "../ast.js";
import type { TableRefAt } from "./dml.js";
import type { ParseExpr, ParseOrderList, ParseTypeName } from "./expr.js";
import type { ParseSubquery } from "./select.js";
import type {
	Expect,
	Ident,
	IdentList,
	IsOp,
	IsWord,
	Name,
	Nx,
	Ok,
	SyntaxErr,
	Toks,
} from "./util.js";

export type ParseCreate<T extends Toks, I extends number> = (
	IsWord<T, I, "temp" | "temporary"> extends true
		? Nx<I>
		: I
) extends infer J extends number
	? IsWord<T, J, "table"> extends true
		? ParseCreateTable<T, Nx<J>>
		: IsWord<T, J, "view"> extends true
			? ParseCreateView<T, Nx<J>>
			: IsWord<T, J, "trigger"> extends true
				? SkipTrigger<T, Nx<J>>
				: J extends I
					? IsWord<T, J, "unique"> extends true
						? IsWord<T, Nx<J>, "index"> extends true
							? ParseCreateIndex<T, Nx<Nx<J>>>
							: SyntaxErr<T, Nx<J>>
						: IsWord<T, J, "index"> extends true
							? ParseCreateIndex<T, Nx<J>>
							: IsWord<T, J, "virtual"> extends true
								? ParseVirtual<T, Nx<J>>
								: SyntaxErr<T, J>
					: SyntaxErr<T, J>
	: never;

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

type ParseCreateTable<T extends Toks, I extends number> =
	IfNotExists<T, I> extends [infer Ine extends boolean, infer J extends number]
		? TableRefAt<T, J> extends infer R
			? R extends Ok<infer Table, infer J2 extends number>
				? IsWord<T, J2, "as"> extends true
					? ParseSubquery<T, Nx<J2>> extends infer Q
						? Q extends Ok<infer S extends SelectStmt, infer J3 extends number>
							? Ok<
									{
										t: "create_table_as";
										ifNotExists: Ine;
										table: Table;
										q: S;
									},
									J3
								>
							: Q
						: never
					: Expect<T, J2, "("> extends infer J3
						? J3 extends number
							? ColumnDefs<T, J3, []> extends infer C
								? C extends Ok<
										infer Cols extends readonly ColumnDef[],
										infer J4 extends number
									>
									? TableConstraints<T, J4, []> extends infer TC
										? TC extends Ok<
												infer Pk extends readonly string[],
												infer J5 extends number
											>
											? Expect<T, J5, ")"> extends infer J6
												? J6 extends number
													? TableOptions<T, J6, false, false> extends infer O
														? O extends Ok<
																[
																	infer NoRowid extends boolean,
																	infer Strict extends boolean,
																],
																infer J7 extends number
															>
															? Ok<
																	{
																		t: "create_table";
																		ifNotExists: Ine;
																		table: Table;
																		columns: Cols;
																		pk: Pk;
																		withoutRowid: NoRowid;
																		strict: Strict;
																	},
																	J7
																>
															: O
														: never
													: J6
												: never
											: TC
										: never
									: C
								: never
							: J3
						: never
				: R
			: never
		: IfNotExists<T, I>;

type TableOptions<
	T extends Toks,
	I extends number,
	NoRowid extends boolean,
	Strict extends boolean,
> =
	IsWord<T, I, "without"> extends true
		? IsWord<T, Nx<I>, "rowid"> extends true
			? IsOp<T, Nx<Nx<I>>, ","> extends true
				? TableOptions<T, Nx<Nx<Nx<I>>>, true, Strict>
				: Ok<[true, Strict], Nx<Nx<I>>>
			: SqlError<
					`unknown table option: ${T[Nx<I>] extends { readonly v: infer V extends string } ? V : ""}`,
					Nx<I>
				>
		: IsWord<T, I, "strict"> extends true
			? IsOp<T, Nx<I>, ","> extends true
				? TableOptions<T, Nx<Nx<I>>, NoRowid, true>
				: Ok<[NoRowid, true], Nx<I>>
			: Ok<[NoRowid, Strict], I>;

type ColumnDefs<
	T extends Toks,
	I extends number,
	Acc extends readonly ColumnDef[],
> =
	ParseColumnDef<T, I> extends infer C
		? C extends Ok<infer Col extends ColumnDef, infer J extends number>
			? IsOp<T, J, ","> extends true
				? IsWord<
						T,
						Nx<J>,
						"constraint" | "primary" | "unique" | "check" | "foreign"
					> extends true
					? Ok<[...Acc, Col], Nx<J>>
					: ColumnDefs<T, Nx<J>, [...Acc, Col]>
				: Ok<[...Acc, Col], J>
			: C
		: never;

export type ParseColumnDef<T extends Toks, I extends number> =
	Ident<T, I> extends infer N extends Name
		? ParseTypeName<T, Nx<I>> extends infer TN
			? TN extends Ok<infer Ty extends string, infer J extends number>
				? ColConstraints<
						T,
						J,
						{
							notNull: false;
							hasDefault: false;
							pk: false;
							desc: false;
							generated: false;
						}
					> extends infer CC
					? CC extends Ok<infer F, infer J2 extends number>
						? F extends {
								readonly notNull: infer NN extends boolean;
								readonly hasDefault: infer HD extends boolean;
								readonly pk: infer PK extends boolean;
								readonly desc: infer D extends boolean;
								readonly generated: infer G extends boolean;
							}
							? Ok<
									{
										name: N["n"];
										type: Ty;
										notNull: NN;
										hasDefault: HD;
										generated: G;
										primaryKey: PK extends true
											? D extends true
												? "desc"
												: true
											: false;
									},
									J2
								>
							: never
						: CC
					: never
				: TN
			: never
		: SyntaxErr<T, I>;

type Flags = {
	readonly notNull: boolean;
	readonly hasDefault: boolean;
	readonly pk: boolean;
	readonly desc: boolean;
	readonly generated: boolean;
};
type Set_<F extends Flags, K extends keyof Flags> = {
	readonly [P in keyof Flags]: P extends K ? true : F[P];
};

type ConflictClause<T extends Toks, I extends number> =
	IsWord<T, I, "on"> extends true
		? IsWord<T, Nx<I>, "conflict"> extends true
			? IsWord<
					T,
					Nx<Nx<I>>,
					"rollback" | "abort" | "fail" | "ignore" | "replace"
				> extends true
				? Nx<Nx<Nx<I>>>
				: SyntaxErr<T, Nx<Nx<I>>>
			: SyntaxErr<T, Nx<I>>
		: I;

type ColConstraints<T extends Toks, I extends number, F extends Flags> =
	IsWord<T, I, "constraint"> extends true
		? Ident<T, Nx<I>> extends Name
			? ColConstraints<T, Nx<Nx<I>>, F>
			: SyntaxErr<T, Nx<I>>
		: IsWord<T, I, "primary"> extends true
			? IsWord<T, Nx<I>, "key"> extends true
				? (
						IsWord<T, Nx<Nx<I>>, "desc"> extends true
							? [true, Nx<Nx<Nx<I>>>]
							: IsWord<T, Nx<Nx<I>>, "asc"> extends true
								? [false, Nx<Nx<Nx<I>>>]
								: [false, Nx<Nx<I>>]
					) extends [infer D extends boolean, infer J extends number]
					? ConflictClause<T, J> extends infer J2
						? J2 extends number
							? ColConstraints<
									T,
									IsWord<T, J2, "autoincrement"> extends true ? Nx<J2> : J2,
									D extends true ? Set_<Set_<F, "pk">, "desc"> : Set_<F, "pk">
								>
							: J2
						: never
					: never
				: SyntaxErr<T, Nx<I>>
			: IsWord<T, I, "not"> extends true
				? IsWord<T, Nx<I>, "null"> extends true
					? ConflictClause<T, Nx<Nx<I>>> extends infer J
						? J extends number
							? ColConstraints<T, J, Set_<F, "notNull">>
							: J
						: never
					: SyntaxErr<T, Nx<I>>
				: IsWord<T, I, "null"> extends true
					? ConflictClause<T, Nx<I>> extends infer J
						? J extends number
							? ColConstraints<T, J, F>
							: J
						: never
					: IsWord<T, I, "unique"> extends true
						? ConflictClause<T, Nx<I>> extends infer J
							? J extends number
								? ColConstraints<T, J, F>
								: J
							: never
						: IsWord<T, I, "check"> extends true
							? ParenExpr<T, Nx<I>> extends infer J
								? J extends number
									? ColConstraints<T, J, F>
									: J
								: never
							: IsWord<T, I, "default"> extends true
								? DefaultValue<T, Nx<I>> extends infer J
									? J extends number
										? ColConstraints<T, J, Set_<F, "hasDefault">>
										: J
									: never
								: IsWord<T, I, "collate"> extends true
									? Ident<T, Nx<I>> extends Name
										? ColConstraints<T, Nx<Nx<I>>, F>
										: SyntaxErr<T, Nx<I>>
									: IsWord<T, I, "references"> extends true
										? ForeignKey<T, Nx<I>> extends infer J
											? J extends number
												? ColConstraints<T, J, F>
												: J
											: never
										: IsWord<T, I, "generated" | "as"> extends true
											? (
													IsWord<T, I, "generated"> extends true
														? IsWord<T, Nx<I>, "always"> extends true
															? IsWord<T, Nx<Nx<I>>, "as"> extends true
																? Nx<Nx<Nx<I>>>
																: SyntaxErr<T, Nx<Nx<I>>>
															: SyntaxErr<T, Nx<I>>
														: Nx<I>
												) extends infer J
												? J extends number
													? ParenExpr<T, J> extends infer J2
														? J2 extends number
															? ColConstraints<
																	T,
																	IsWord<
																		T,
																		J2,
																		"stored" | "virtual"
																	> extends true
																		? Nx<J2>
																		: J2,
																	Set_<Set_<F, "hasDefault">, "generated">
																>
															: J2
														: never
													: J
												: never
											: Ok<F, I>;

type ParenExpr<T extends Toks, I extends number> =
	Expect<T, I, "("> extends infer J
		? J extends number
			? ParseExpr<T, J> extends infer R
				? R extends Ok<Expr, infer J2 extends number>
					? Expect<T, J2, ")">
					: R
				: never
			: J
		: never;

type DefaultValue<T extends Toks, I extends number> =
	IsOp<T, I, "("> extends true
		? ParenExpr<T, I>
		: IsOp<T, I, "+" | "-"> extends true
			? T[Nx<I>] extends { readonly k: "n" }
				? Nx<Nx<I>>
				: SyntaxErr<T, Nx<I>>
			: T[I] extends { readonly k: "n" | "s" | "id" }
				? Nx<I>
				: T[I] extends { readonly k: "w" }
					? IsWord<
							T,
							I,
							"null" | "current_time" | "current_date" | "current_timestamp"
						> extends true
						? Nx<I>
						: Ident<T, I> extends Name
							? Nx<I>
							: SyntaxErr<T, I>
					: SyntaxErr<T, I>;

type ForeignKey<T extends Toks, I extends number> =
	Ident<T, I> extends Name
		? (
				IsOp<T, Nx<I>, "("> extends true
					? IdentList<T, Nx<I>>
					: Ok<[], Nx<I>>
			) extends infer R
			? R extends Ok<unknown, infer J extends number>
				? FkActions<T, J>
				: R
			: never
		: SyntaxErr<T, I>;
type FkActions<T extends Toks, I extends number> =
	IsWord<T, I, "on"> extends true
		? IsWord<T, Nx<I>, "delete" | "update"> extends true
			? IsWord<T, Nx<Nx<I>>, "set"> extends true
				? IsWord<T, Nx<Nx<Nx<I>>>, "null" | "default"> extends true
					? FkActions<T, Nx<Nx<Nx<Nx<I>>>>>
					: SyntaxErr<T, Nx<Nx<Nx<I>>>>
				: IsWord<T, Nx<Nx<I>>, "cascade" | "restrict"> extends true
					? FkActions<T, Nx<Nx<Nx<I>>>>
					: IsWord<T, Nx<Nx<I>>, "no"> extends true
						? IsWord<T, Nx<Nx<Nx<I>>>, "action"> extends true
							? FkActions<T, Nx<Nx<Nx<Nx<I>>>>>
							: SyntaxErr<T, Nx<Nx<Nx<I>>>>
						: SyntaxErr<T, Nx<Nx<I>>>
			: SyntaxErr<T, Nx<I>>
		: IsWord<T, I, "match"> extends true
			? Ident<T, Nx<I>> extends Name
				? FkActions<T, Nx<Nx<I>>>
				: SyntaxErr<T, Nx<I>>
			: IsWord<T, I, "not"> extends true
				? IsWord<T, Nx<I>, "deferrable"> extends true
					? Deferrable<T, Nx<Nx<I>>>
					: I
				: IsWord<T, I, "deferrable"> extends true
					? Deferrable<T, Nx<I>>
					: I;
type Deferrable<T extends Toks, I extends number> =
	IsWord<T, I, "initially"> extends true
		? IsWord<T, Nx<I>, "deferred" | "immediate"> extends true
			? Nx<Nx<I>>
			: SyntaxErr<T, Nx<I>>
		: I;

type TableConstraints<
	T extends Toks,
	I extends number,
	Pk extends readonly string[],
> =
	IsWord<T, I, "constraint"> extends true
		? Ident<T, Nx<I>> extends Name
			? TableConstraints<T, Nx<Nx<I>>, Pk>
			: SyntaxErr<T, Nx<I>>
		: IsWord<T, I, "primary"> extends true
			? IsWord<T, Nx<I>, "key"> extends true
				? Expect<T, Nx<Nx<I>>, "("> extends infer J
					? J extends number
						? ParseOrderList<T, J, []> extends infer L
							? L extends Ok<
									infer Cols extends readonly Expr[],
									infer J2 extends number
								>
								? Expect<T, J2, ")"> extends infer J3
									? J3 extends number
										? ConflictClause<T, J3> extends infer J4
											? J4 extends number
												? NextConstraint<T, J4, [...Pk, ...PkNames<Cols>]>
												: J4
											: never
										: J3
									: never
								: L
							: never
						: J
					: never
				: SyntaxErr<T, Nx<I>>
			: IsWord<T, I, "unique"> extends true
				? Expect<T, Nx<I>, "("> extends infer J
					? J extends number
						? ParseOrderList<T, J, []> extends infer L
							? L extends Ok<unknown, infer J2 extends number>
								? Expect<T, J2, ")"> extends infer J3
									? J3 extends number
										? ConflictClause<T, J3> extends infer J4
											? J4 extends number
												? NextConstraint<T, J4, Pk>
												: J4
											: never
										: J3
									: never
								: L
							: never
						: J
					: never
				: IsWord<T, I, "check"> extends true
					? ParenExpr<T, Nx<I>> extends infer J
						? J extends number
							? NextConstraint<T, J, Pk>
							: J
						: never
					: IsWord<T, I, "foreign"> extends true
						? IsWord<T, Nx<I>, "key"> extends true
							? IdentList<T, Nx<Nx<I>>> extends infer L
								? L extends Ok<unknown, infer J extends number>
									? IsWord<T, J, "references"> extends true
										? ForeignKey<T, Nx<J>> extends infer J2
											? J2 extends number
												? NextConstraint<T, J2, Pk>
												: J2
											: never
										: SyntaxErr<T, J>
									: L
								: never
							: SyntaxErr<T, Nx<I>>
						: Ok<Pk, I>;
type NextConstraint<
	T extends Toks,
	I extends number,
	Pk extends readonly string[],
> = IsOp<T, I, ","> extends true ? TableConstraints<T, Nx<I>, Pk> : Ok<Pk, I>;
type PkNames<Cols extends readonly Expr[]> = {
	[K in keyof Cols]: Cols[K] extends {
		readonly t: "col";
		readonly name: infer N extends string;
	}
		? N
		: Cols[K] extends {
					readonly t: "collate";
					readonly e: {
						readonly t: "col";
						readonly name: infer N extends string;
					};
				}
			? N
			: never;
};

type ParseCreateView<T extends Toks, I extends number> =
	IfNotExists<T, I> extends [infer Ine extends boolean, infer J extends number]
		? TableRefAt<T, J> extends infer R
			? R extends Ok<infer View, infer J2 extends number>
				? (
						IsOp<T, J2, "("> extends true
							? IdentList<T, J2>
							: Ok<null, J2>
					) extends infer C
					? C extends Ok<infer Cols, infer J3 extends number>
						? IsWord<T, J3, "as"> extends true
							? ParseSubquery<T, Nx<J3>> extends infer Q
								? Q extends Ok<
										infer S extends SelectStmt,
										infer J4 extends number
									>
									? Ok<
											{
												t: "create_view";
												ifNotExists: Ine;
												view: View;
												cols: Cols;
												q: S;
											},
											J4
										>
									: Q
								: never
							: SyntaxErr<T, J3>
						: C
					: never
				: R
			: never
		: IfNotExists<T, I>;

type ParseCreateIndex<T extends Toks, I extends number> =
	IfNotExists<T, I> extends [boolean, infer J extends number]
		? TableRefAt<T, J> extends infer R
			? R extends Ok<unknown, infer J2 extends number>
				? IsWord<T, J2, "on"> extends true
					? Ident<T, Nx<J2>> extends infer N extends Name
						? Expect<T, Nx<Nx<J2>>, "("> extends infer J3
							? J3 extends number
								? ParseOrderList<T, J3, []> extends infer L
									? L extends Ok<
											infer Cols extends readonly Expr[],
											infer J4 extends number
										>
										? Expect<T, J4, ")"> extends infer J5
											? J5 extends number
												? (
														IsWord<T, J5, "where"> extends true
															? ParseExpr<T, Nx<J5>>
															: Ok<null, J5>
													) extends infer Wh
													? Wh extends Ok<infer Where, infer J6 extends number>
														? Ok<
																{
																	t: "create_index";
																	table: { schema: null; name: N["v"] };
																	cols: Cols;
																	where: Where;
																},
																J6
															>
														: Wh
													: never
												: J5
											: never
										: L
									: never
								: J3
							: never
						: SyntaxErr<T, Nx<J2>>
					: SyntaxErr<T, J2>
				: R
			: never
		: IfNotExists<T, I>;

type SkipTrigger<T extends Toks, I extends number> =
	IfNotExists<T, I> extends [boolean, infer J extends number]
		? TableRefAt<T, J> extends infer R
			? R extends Ok<unknown, infer J2 extends number>
				? SkipToBegin<T, J2>
				: R
			: never
		: IfNotExists<T, I>;
type SkipToBegin<T extends Toks, I extends number> =
	IsWord<T, I, "begin"> extends true
		? SkipBody<T, Nx<I>, []>
		: T[I] extends { readonly k: string }
			? SkipToBegin<T, Nx<I>>
			: SyntaxErr<T, I>;
type SkipBody<
	T extends Toks,
	I extends number,
	Depth extends readonly unknown[],
> =
	IsWord<T, I, "case"> extends true
		? SkipBody<T, Nx<I>, [...Depth, 0]>
		: IsWord<T, I, "end"> extends true
			? Depth extends readonly [unknown, ...infer D]
				? SkipBody<T, Nx<I>, D>
				: Ok<{ t: "noop"; what: "trigger" }, Nx<I>>
			: T[I] extends { readonly k: string }
				? SkipBody<T, Nx<I>, Depth>
				: SyntaxErr<T, I>;

type ParseVirtual<T extends Toks, I extends number> =
	IsWord<T, I, "table"> extends true
		? IfNotExists<T, Nx<I>> extends [boolean, infer J extends number]
			? TableRefAt<T, J> extends infer R
				? R extends Ok<infer Table, infer J2 extends number>
					? IsWord<T, J2, "using"> extends true
						? Ident<T, Nx<J2>> extends infer M extends Name
							? IsOp<T, Nx<Nx<J2>>, "("> extends true
								? VirtualArgs<T, Nx<Nx<Nx<J2>>>, [], []> extends infer A
									? A extends Ok<
											infer Cols extends readonly string[],
											infer J3 extends number
										>
										? Ok<
												{
													t: "virtual";
													module: M["v"];
													table: Table;
													cols: Cols;
												},
												J3
											>
										: A
									: never
								: Ok<
										{ t: "virtual"; module: M["v"]; table: Table; cols: [] },
										Nx<Nx<J2>>
									>
							: SyntaxErr<T, Nx<J2>>
						: SyntaxErr<T, J2>
					: R
				: never
			: IfNotExists<T, Nx<I>>
		: SyntaxErr<T, I>;
type VirtualArgs<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
	Depth extends readonly unknown[],
> = Depth extends readonly []
	? IsOp<T, I, ")"> extends true
		? Ok<Acc, Nx<I>>
		: (
					Ident<T, I> extends infer N extends Name
						? IsOp<T, Nx<I>, "," | ")"> extends true
							? N["n"] extends `${string}=${string}`
								? Acc
								: [...Acc, N["n"]]
							: Acc
						: Acc
				) extends infer Acc2 extends readonly string[]
			? SkipArg<T, I, []> extends infer J
				? J extends number
					? IsOp<T, J, ","> extends true
						? VirtualArgs<T, Nx<J>, Acc2, []>
						: VirtualArgs<T, J, Acc2, []>
					: J
				: never
			: never
	: never;
type SkipArg<
	T extends Toks,
	I extends number,
	Depth extends readonly unknown[],
> = Depth extends readonly []
	? IsOp<T, I, "," | ")"> extends true
		? I
		: IsOp<T, I, "("> extends true
			? SkipArg<T, Nx<I>, [0]>
			: T[I] extends { readonly k: string }
				? SkipArg<T, Nx<I>, Depth>
				: SyntaxErr<T, I>
	: IsOp<T, I, "("> extends true
		? SkipArg<T, Nx<I>, [...Depth, 0]>
		: IsOp<T, I, ")"> extends true
			? SkipArg<T, Nx<I>, Depth extends readonly [unknown, ...infer D] ? D : []>
			: T[I] extends { readonly k: string }
				? SkipArg<T, Nx<I>, Depth>
				: SyntaxErr<T, I>;

export type ParseAlter<T extends Toks, I extends number> =
	IsWord<T, I, "table"> extends true
		? TableRefAt<T, Nx<I>> extends infer R
			? R extends Ok<infer Table, infer J extends number>
				? IsWord<T, J, "rename"> extends true
					? IsWord<T, Nx<J>, "to"> extends true
						? Ident<T, Nx<Nx<J>>> extends infer N extends Name
							? Ok<
									{
										t: "alter_table";
										table: Table;
										action: { t: "rename_table"; to: N["n"] };
									},
									Nx<Nx<Nx<J>>>
								>
							: SyntaxErr<T, Nx<Nx<J>>>
						: (
									IsWord<T, Nx<J>, "column"> extends true
										? Nx<Nx<J>>
										: Nx<J>
								) extends infer J2 extends number
							? Ident<T, J2> extends infer A extends Name
								? IsWord<T, Nx<J2>, "to"> extends true
									? Ident<T, Nx<Nx<J2>>> extends infer B extends Name
										? Ok<
												{
													t: "alter_table";
													table: Table;
													action: {
														t: "rename_column";
														from: A["v"];
														to: B["n"];
													};
												},
												Nx<Nx<Nx<J2>>>
											>
										: SyntaxErr<T, Nx<Nx<J2>>>
									: SyntaxErr<T, Nx<J2>>
								: SyntaxErr<T, J2>
							: never
					: IsWord<T, J, "add"> extends true
						? ParseColumnDef<
								T,
								IsWord<T, Nx<J>, "column"> extends true ? Nx<Nx<J>> : Nx<J>
							> extends infer C
							? C extends Ok<infer Col, infer J2 extends number>
								? Ok<
										{
											t: "alter_table";
											table: Table;
											action: { t: "add_column"; col: Col };
										},
										J2
									>
								: C
							: never
						: IsWord<T, J, "drop"> extends true
							? (
									IsWord<T, Nx<J>, "column"> extends true
										? Nx<Nx<J>>
										: Nx<J>
								) extends infer J2 extends number
								? Ident<T, J2> extends infer N extends Name
									? Ok<
											{
												t: "alter_table";
												table: Table;
												action: { t: "drop_column"; name: N["v"] };
											},
											Nx<J2>
										>
									: SyntaxErr<T, J2>
								: never
							: SyntaxErr<T, J>
				: R
			: never
		: SyntaxErr<T, I>;

export type ParseDrop<T extends Toks, I extends number> = T[I] extends {
	readonly k: "w";
	readonly v: infer K extends "table" | "view" | "index" | "trigger";
}
	? IfExists<T, Nx<I>> extends [
			infer Ie extends boolean,
			infer J extends number,
		]
		? TableRefAt<T, J> extends infer R
			? R extends Ok<infer Name_, infer J2 extends number>
				? Ok<{ t: "drop"; kind: K; ifExists: Ie; name: Name_ }, J2>
				: R
			: never
		: IfExists<T, Nx<I>>
	: SyntaxErr<T, I>;

export type SkipStatement<
	T extends Toks,
	I extends number,
	What extends string,
> = T[I] extends { readonly k: "o"; readonly v: ";" }
	? Ok<{ t: "noop"; what: What }, I>
	: T[I] extends { readonly k: string }
		? SkipStatement<T, Nx<I>, What>
		: Ok<{ t: "noop"; what: What }, I>;
