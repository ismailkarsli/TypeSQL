import type {
	CloseOk,
	Expect,
	IfExists,
	IfNotExists,
	IsOp,
	IsWord,
	Name,
	SkipColumn,
	SyntaxErr,
} from "../../../engine/family/parse.js";
import type { Next } from "../../../engine/next.js";
import type { Ok, Toks } from "../../../engine/tokens.js";
import type { SqlError } from "../../../errors.js";
import type { ColumnDef, Expr, SelectStmt } from "../ast.js";
import type {
	OptWhere,
	ParseExpr,
	ParseOrderList,
	ParseTypeName,
} from "./expr.js";
import type { ParseSubquery } from "./select.js";
import type { Ident, IdentList, OptCols, TableRefAt } from "./util.js";

export type ParseCreate<T extends Toks, I extends number> = (
	IsWord<T, I, "temp" | "temporary"> extends true
		? Next<I>
		: I
) extends infer J extends number
	? IsWord<T, J, "table"> extends true
		? ParseCreateTable<T, Next<J>>
		: IsWord<T, J, "view"> extends true
			? ParseCreateView<T, Next<J>>
			: IsWord<T, J, "trigger"> extends true
				? SkipTrigger<T, Next<J>>
				: J extends I
					? IsWord<T, J, "unique"> extends true
						? IsWord<T, Next<J>, "index"> extends true
							? ParseCreateIndex<T, Next<Next<J>>>
							: SyntaxErr<T, Next<J>>
						: IsWord<T, J, "index"> extends true
							? ParseCreateIndex<T, Next<J>>
							: IsWord<T, J, "virtual"> extends true
								? ParseVirtual<T, Next<J>>
								: SyntaxErr<T, J>
					: SyntaxErr<T, J>
	: never;

type ParseCreateTable<T extends Toks, I extends number> =
	IfNotExists<T, I> extends [infer Ine extends boolean, infer J extends number]
		? TableRefAt<T, J> extends Ok<infer Table, infer J2 extends number>
			? IsWord<T, J2, "as"> extends true
				? ParseSubquery<T, Next<J2>> extends Ok<
						infer S extends SelectStmt,
						infer J3 extends number
					>
					? Ok<
							{
								t: "create_table_as";
								ifNotExists: Ine;
								table: Table;
								q: S;
							},
							J3
						>
					: ParseSubquery<T, Next<J2>>
				: Expect<T, J2, "("> extends infer J3 extends number
					? ColumnDefs<T, J3, []> extends Ok<
							infer Cols extends readonly ColumnDef[],
							infer J4 extends number
						>
						? TableConstraints<T, J4, []> extends Ok<
								infer Pk extends readonly string[],
								infer J5 extends number
							>
							? Expect<T, J5, ")"> extends infer J6 extends number
								? TableOptions<T, J6, false, false> extends Ok<
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
									: TableOptions<T, J6, false, false>
								: Expect<T, J5, ")">
							: TableConstraints<T, J4, []>
						: ColumnDefs<T, J3, []>
					: Expect<T, J2, "(">
			: TableRefAt<T, J>
		: IfNotExists<T, I>;

type TableOptions<
	T extends Toks,
	I extends number,
	NoRowid extends boolean,
	Strict extends boolean,
> =
	IsWord<T, I, "without"> extends true
		? IsWord<T, Next<I>, "rowid"> extends true
			? IsOp<T, Next<Next<I>>, ","> extends true
				? TableOptions<T, Next<Next<Next<I>>>, true, Strict>
				: Ok<[true, Strict], Next<Next<I>>>
			: SqlError<
					`unknown table option: ${T[Next<I>] extends { readonly v: infer V extends string } ? V : ""}`,
					Next<I>
				>
		: IsWord<T, I, "strict"> extends true
			? IsOp<T, Next<I>, ","> extends true
				? TableOptions<T, Next<Next<I>>, NoRowid, true>
				: Ok<[NoRowid, true], Next<I>>
			: Ok<[NoRowid, Strict], I>;

type ColumnDefs<
	T extends Toks,
	I extends number,
	Acc extends readonly ColumnDef[],
> =
	ParseColumnDef<T, I> extends Ok<
		infer Col extends ColumnDef,
		infer J extends number
	>
		? IsOp<T, J, ","> extends true
			? IsWord<
					T,
					Next<J>,
					"constraint" | "primary" | "unique" | "check" | "foreign"
				> extends true
				? Ok<[...Acc, Col], Next<J>>
				: ColumnDefs<T, Next<J>, [...Acc, Col]>
			: Ok<[...Acc, Col], J>
		: ParseColumnDef<T, I>;

type ParseColumnDef<T extends Toks, I extends number> =
	Ident<T, I> extends infer N extends Name
		? ParseTypeName<T, Next<I>> extends Ok<
				infer Ty extends string,
				infer J extends number
			>
			? ColConstraints<T, J, NoFlags> extends Ok<
					{
						readonly notNull: infer NN extends boolean;
						readonly hasDefault: infer HD extends boolean;
						readonly pk: infer PK extends boolean;
						readonly desc: infer D extends boolean;
						readonly generated: infer G extends boolean;
					},
					infer J2 extends number
				>
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
				: ColConstraints<T, J, NoFlags>
			: ParseTypeName<T, Next<I>>
		: SyntaxErr<T, I>;

type NoFlags = {
	notNull: false;
	hasDefault: false;
	pk: false;
	desc: false;
	generated: false;
};

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
		? IsWord<T, Next<I>, "conflict"> extends true
			? IsWord<
					T,
					Next<Next<I>>,
					"rollback" | "abort" | "fail" | "ignore" | "replace"
				> extends true
				? Next<Next<Next<I>>>
				: SyntaxErr<T, Next<Next<I>>>
			: SyntaxErr<T, Next<I>>
		: I;

type ColConstraints<T extends Toks, I extends number, F extends Flags> =
	IsWord<T, I, "constraint" | "collate"> extends true
		? Ident<T, Next<I>> extends Name
			? ColConstraints<T, Next<Next<I>>, F>
			: SyntaxErr<T, Next<I>>
		: IsWord<T, I, "primary"> extends true
			? IsWord<T, Next<I>, "key"> extends true
				? (
						IsWord<T, Next<Next<I>>, "desc"> extends true
							? [true, Next<Next<Next<I>>>]
							: IsWord<T, Next<Next<I>>, "asc"> extends true
								? [false, Next<Next<Next<I>>>]
								: [false, Next<Next<I>>]
					) extends [infer D extends boolean, infer J extends number]
					? ColNext<
							T,
							SkipWordAt<T, ConflictClause<T, J>, "autoincrement">,
							D extends true ? Set_<Set_<F, "pk">, "desc"> : Set_<F, "pk">
						>
					: never
				: SyntaxErr<T, Next<I>>
			: IsWord<T, I, "not"> extends true
				? IsWord<T, Next<I>, "null"> extends true
					? ColNext<T, ConflictClause<T, Next<Next<I>>>, Set_<F, "notNull">>
					: SyntaxErr<T, Next<I>>
				: IsWord<T, I, "null" | "unique"> extends true
					? ColNext<T, ConflictClause<T, Next<I>>, F>
					: IsWord<T, I, "check"> extends true
						? ColNext<T, ParenExpr<T, Next<I>>, F>
						: IsWord<T, I, "default"> extends true
							? ColNext<T, DefaultValue<T, Next<I>>, Set_<F, "hasDefault">>
							: IsWord<T, I, "references"> extends true
								? ColNext<T, ForeignKey<T, Next<I>>, F>
								: IsWord<T, I, "generated" | "as"> extends true
									? ColNext<
											T,
											GeneratedAs<T, I>,
											Set_<Set_<F, "hasDefault">, "generated">
										>
									: Ok<F, I>;
type ColNext<T extends Toks, J, F extends Flags> = J extends number
	? ColConstraints<T, J, F>
	: J;
type SkipWordAt<T extends Toks, J, W extends string> = J extends number
	? IsWord<T, J, W> extends true
		? Next<J>
		: J
	: J;
type GeneratedAs<T extends Toks, I extends number> =
	IsWord<T, I, "as"> extends true
		? SkipWordAt<T, ParenExpr<T, Next<I>>, "stored" | "virtual">
		: IsWord<T, Next<I>, "always"> extends true
			? IsWord<T, Next<Next<I>>, "as"> extends true
				? SkipWordAt<T, ParenExpr<T, Next<Next<Next<I>>>>, "stored" | "virtual">
				: SyntaxErr<T, Next<Next<I>>>
			: SyntaxErr<T, Next<I>>;

type ParenExpr<T extends Toks, I extends number> =
	Expect<T, I, "("> extends infer J extends number
		? ParseExpr<T, J> extends Ok<Expr, infer J2 extends number>
			? Expect<T, J2, ")">
			: ParseExpr<T, J>
		: Expect<T, I, "(">;

type DefaultValue<T extends Toks, I extends number> =
	IsOp<T, I, "("> extends true
		? ParenExpr<T, I>
		: IsOp<T, I, "+" | "-"> extends true
			? T[Next<I>] extends { readonly k: "n" }
				? Next<Next<I>>
				: SyntaxErr<T, Next<I>>
			: T[I] extends { readonly k: "n" | "s" | "id" }
				? Next<I>
				: T[I] extends { readonly k: "w" }
					? IsWord<
							T,
							I,
							"null" | "current_time" | "current_date" | "current_timestamp"
						> extends true
						? Next<I>
						: Ident<T, I> extends Name
							? Next<I>
							: SyntaxErr<T, I>
					: SyntaxErr<T, I>;

type ForeignKey<T extends Toks, I extends number> =
	Ident<T, I> extends Name
		? OptCols<T, Next<I>> extends Ok<unknown, infer J extends number>
			? FkActions<T, J>
			: OptCols<T, Next<I>>
		: SyntaxErr<T, I>;
type FkActions<T extends Toks, I extends number> =
	IsWord<T, I, "on"> extends true
		? IsWord<T, Next<I>, "delete" | "update"> extends true
			? IsWord<T, Next<Next<I>>, "set"> extends true
				? IsWord<T, Next<Next<Next<I>>>, "null" | "default"> extends true
					? FkActions<T, Next<Next<Next<Next<I>>>>>
					: SyntaxErr<T, Next<Next<Next<I>>>>
				: IsWord<T, Next<Next<I>>, "cascade" | "restrict"> extends true
					? FkActions<T, Next<Next<Next<I>>>>
					: IsWord<T, Next<Next<I>>, "no"> extends true
						? IsWord<T, Next<Next<Next<I>>>, "action"> extends true
							? FkActions<T, Next<Next<Next<Next<I>>>>>
							: SyntaxErr<T, Next<Next<Next<I>>>>
						: SyntaxErr<T, Next<Next<I>>>
			: SyntaxErr<T, Next<I>>
		: IsWord<T, I, "match"> extends true
			? Ident<T, Next<I>> extends Name
				? FkActions<T, Next<Next<I>>>
				: SyntaxErr<T, Next<I>>
			: IsWord<T, I, "not"> extends true
				? IsWord<T, Next<I>, "deferrable"> extends true
					? Deferrable<T, Next<Next<I>>>
					: I
				: IsWord<T, I, "deferrable"> extends true
					? Deferrable<T, Next<I>>
					: I;
type Deferrable<T extends Toks, I extends number> =
	IsWord<T, I, "initially"> extends true
		? IsWord<T, Next<I>, "deferred" | "immediate"> extends true
			? Next<Next<I>>
			: SyntaxErr<T, Next<I>>
		: I;

type TableConstraints<
	T extends Toks,
	I extends number,
	Pk extends readonly string[],
> =
	IsWord<T, I, "constraint"> extends true
		? Ident<T, Next<I>> extends Name
			? TableConstraints<T, Next<Next<I>>, Pk>
			: SyntaxErr<T, Next<I>>
		: IsWord<T, I, "primary"> extends true
			? IsWord<T, Next<I>, "key"> extends true
				? ParenOrderList<T, Next<Next<I>>> extends Ok<
						infer Cols extends readonly Expr[],
						infer J extends number
					>
					? NextConstraint<T, ConflictClause<T, J>, [...Pk, ...PkNames<Cols>]>
					: ParenOrderList<T, Next<Next<I>>>
				: SyntaxErr<T, Next<I>>
			: IsWord<T, I, "unique"> extends true
				? ParenOrderList<T, Next<I>> extends Ok<unknown, infer J extends number>
					? NextConstraint<T, ConflictClause<T, J>, Pk>
					: ParenOrderList<T, Next<I>>
				: IsWord<T, I, "check"> extends true
					? NextConstraint<T, ParenExpr<T, Next<I>>, Pk>
					: IsWord<T, I, "foreign"> extends true
						? IsWord<T, Next<I>, "key"> extends true
							? IdentList<T, Next<Next<I>>> extends Ok<
									unknown,
									infer J extends number
								>
								? IsWord<T, J, "references"> extends true
									? NextConstraint<T, ForeignKey<T, Next<J>>, Pk>
									: SyntaxErr<T, J>
								: IdentList<T, Next<Next<I>>>
							: SyntaxErr<T, Next<I>>
						: Ok<Pk, I>;
type NextConstraint<
	T extends Toks,
	J,
	Pk extends readonly string[],
> = J extends number
	? IsOp<T, J, ","> extends true
		? TableConstraints<T, Next<J>, Pk>
		: Ok<Pk, J>
	: J;
type ParenOrderList<T extends Toks, I extends number> =
	Expect<T, I, "("> extends infer J extends number
		? ParseOrderList<T, J, []> extends Ok<
				infer Cols extends readonly Expr[],
				infer J2 extends number
			>
			? CloseOk<T, J2, Cols>
			: ParseOrderList<T, J, []>
		: Expect<T, I, "(">;
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
		? TableRefAt<T, J> extends Ok<infer View, infer J2 extends number>
			? OptCols<T, J2> extends Ok<infer Cols, infer J3 extends number>
				? IsWord<T, J3, "as"> extends true
					? ParseSubquery<T, Next<J3>> extends Ok<
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
						: ParseSubquery<T, Next<J3>>
					: SyntaxErr<T, J3>
				: OptCols<T, J2>
			: TableRefAt<T, J>
		: IfNotExists<T, I>;

type ParseCreateIndex<T extends Toks, I extends number> =
	IfNotExists<T, I> extends [boolean, infer J extends number]
		? TableRefAt<T, J> extends Ok<unknown, infer J2 extends number>
			? IsWord<T, J2, "on"> extends true
				? Ident<T, Next<J2>> extends infer N extends Name
					? ParenOrderList<T, Next<Next<J2>>> extends Ok<
							infer Cols extends readonly Expr[],
							infer J3 extends number
						>
						? OptWhere<T, J3> extends Ok<infer Where, infer J4 extends number>
							? Ok<
									{
										t: "create_index";
										table: { schema: null; name: N["v"] };
										cols: Cols;
										where: Where;
									},
									J4
								>
							: OptWhere<T, J3>
						: ParenOrderList<T, Next<Next<J2>>>
					: SyntaxErr<T, Next<J2>>
				: SyntaxErr<T, J2>
			: TableRefAt<T, J>
		: IfNotExists<T, I>;

type SkipTrigger<T extends Toks, I extends number> =
	IfNotExists<T, I> extends [boolean, infer J extends number]
		? TableRefAt<T, J> extends Ok<unknown, infer J2 extends number>
			? SkipToBegin<T, J2>
			: TableRefAt<T, J>
		: IfNotExists<T, I>;
type SkipToBegin<T extends Toks, I extends number> =
	IsWord<T, I, "begin"> extends true
		? SkipBody<T, Next<I>, []>
		: T[I] extends { readonly k: string }
			? SkipToBegin<T, Next<I>>
			: SyntaxErr<T, I>;
type SkipBody<
	T extends Toks,
	I extends number,
	Depth extends readonly unknown[],
> =
	IsWord<T, I, "case"> extends true
		? SkipBody<T, Next<I>, [...Depth, 0]>
		: IsWord<T, I, "end"> extends true
			? Depth extends readonly [unknown, ...infer D]
				? SkipBody<T, Next<I>, D>
				: Ok<{ t: "noop"; what: "trigger" }, Next<I>>
			: T[I] extends { readonly k: string }
				? SkipBody<T, Next<I>, Depth>
				: SyntaxErr<T, I>;

type ParseVirtual<T extends Toks, I extends number> =
	IsWord<T, I, "table"> extends true
		? IfNotExists<T, Next<I>> extends [boolean, infer J extends number]
			? TableRefAt<T, J> extends Ok<infer Table, infer J2 extends number>
				? IsWord<T, J2, "using"> extends true
					? Ident<T, Next<J2>> extends infer M extends Name
						? IsOp<T, Next<Next<J2>>, "("> extends true
							? VirtualArgs<T, Next<Next<Next<J2>>>, [], []> extends Ok<
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
								: VirtualArgs<T, Next<Next<Next<J2>>>, [], []>
							: Ok<
									{ t: "virtual"; module: M["v"]; table: Table; cols: [] },
									Next<Next<J2>>
								>
						: SyntaxErr<T, Next<J2>>
					: SyntaxErr<T, J2>
				: TableRefAt<T, J>
			: IfNotExists<T, Next<I>>
		: SyntaxErr<T, I>;
type VirtualArgs<
	T extends Toks,
	I extends number,
	Acc extends readonly string[],
	Depth extends readonly unknown[],
> = Depth extends readonly []
	? IsOp<T, I, ")"> extends true
		? Ok<Acc, Next<I>>
		: (
					Ident<T, I> extends infer N extends Name
						? IsOp<T, Next<I>, "," | ")"> extends true
							? N["n"] extends `${string}=${string}`
								? Acc
								: [...Acc, N["n"]]
							: Acc
						: Acc
				) extends infer Acc2 extends readonly string[]
			? SkipArg<T, I, []> extends infer J extends number
				? IsOp<T, J, ","> extends true
					? VirtualArgs<T, Next<J>, Acc2, []>
					: VirtualArgs<T, J, Acc2, []>
				: SkipArg<T, I, []>
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
			? SkipArg<T, Next<I>, [0]>
			: T[I] extends { readonly k: string }
				? SkipArg<T, Next<I>, Depth>
				: SyntaxErr<T, I>
	: IsOp<T, I, "("> extends true
		? SkipArg<T, Next<I>, [...Depth, 0]>
		: IsOp<T, I, ")"> extends true
			? SkipArg<
					T,
					Next<I>,
					Depth extends readonly [unknown, ...infer D] ? D : []
				>
			: T[I] extends { readonly k: string }
				? SkipArg<T, Next<I>, Depth>
				: SyntaxErr<T, I>;

export type ParseAlter<T extends Toks, I extends number> =
	IsWord<T, I, "table"> extends true
		? TableRefAt<T, Next<I>> extends Ok<infer Table, infer J extends number>
			? IsWord<T, J, "rename"> extends true
				? IsWord<T, Next<J>, "to"> extends true
					? Ident<T, Next<Next<J>>> extends infer N extends Name
						? Ok<
								{
									t: "alter_table";
									table: Table;
									action: { t: "rename_table"; to: N["n"] };
								},
								Next<Next<Next<J>>>
							>
						: SyntaxErr<T, Next<Next<J>>>
					: SkipColumn<T, Next<J>> extends infer J2 extends number
						? Ident<T, J2> extends infer A extends Name
							? IsWord<T, Next<J2>, "to"> extends true
								? Ident<T, Next<Next<J2>>> extends infer B extends Name
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
											Next<Next<Next<J2>>>
										>
									: SyntaxErr<T, Next<Next<J2>>>
								: SyntaxErr<T, Next<J2>>
							: SyntaxErr<T, J2>
						: never
				: IsWord<T, J, "add"> extends true
					? ParseColumnDef<T, SkipColumn<T, Next<J>>> extends Ok<
							infer Col,
							infer J2 extends number
						>
						? Ok<
								{
									t: "alter_table";
									table: Table;
									action: { t: "add_column"; col: Col };
								},
								J2
							>
						: ParseColumnDef<T, SkipColumn<T, Next<J>>>
					: IsWord<T, J, "drop"> extends true
						? SkipColumn<T, Next<J>> extends infer J2 extends number
							? Ident<T, J2> extends infer N extends Name
								? Ok<
										{
											t: "alter_table";
											table: Table;
											action: { t: "drop_column"; name: N["v"] };
										},
										Next<J2>
									>
								: SyntaxErr<T, J2>
							: never
						: SyntaxErr<T, J>
			: TableRefAt<T, Next<I>>
		: SyntaxErr<T, I>;

export type ParseDrop<T extends Toks, I extends number> = T[I] extends {
	readonly k: "w";
	readonly v: infer K extends "table" | "view" | "index" | "trigger";
}
	? IfExists<T, Next<I>> extends [
			infer Ie extends boolean,
			infer J extends number,
		]
		? TableRefAt<T, J> extends Ok<infer Name_, infer J2 extends number>
			? Ok<{ t: "drop"; kind: K; ifExists: Ie; name: Name_ }, J2>
			: TableRefAt<T, J>
		: IfExists<T, Next<I>>
	: SyntaxErr<T, I>;
