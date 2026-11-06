import type { ColInfo, Cols, Info } from "../../../engine/types.js";
import type { SqlError } from "../../../errors.js";
import type { Expr, Tag, XmlExpr, XmlTableCol } from "../ast.js";
import type { TypeDisplay } from "../shape.js";
import type { Ctx } from "../types.js";
import type { AllNullable } from "./catalog.js";
import type { ParamsOfList, ParamsOfOpt } from "./params.js";
import type { TypeList, TypeOf } from "./typeof.js";

export type TypeXml<
	E extends XmlExpr,
	C extends Ctx,
> = E["op"] extends "element"
	? TypeList<E["named"], C, []> extends readonly ColInfo[]
		? TypeList<E["args"], C, []> extends readonly ColInfo[]
			? Info<"xml">
			: TypeList<E["args"], C, []>
		: TypeList<E["named"], C, []>
	: E["op"] extends "forest"
		? TypeList<E["named"], C, []> extends infer Ls extends readonly ColInfo[]
			? Info<"xml", AllNullable<Ls>>
			: TypeList<E["named"], C, []>
		: E["op"] extends "concat"
			? CoerceList<
					E["args"],
					C,
					"xml",
					"XMLCONCAT",
					[]
				> extends infer Ls extends readonly ColInfo[]
				? Info<"xml", AllNullable<Ls>>
				: CoerceList<E["args"], C, "xml", "XMLCONCAT", []>
			: E["op"] extends "pi"
				? E["args"] extends readonly [infer A extends Expr]
					? WithType<Coerce<A, C, "text", "XMLPI">, "xml">
					: Info<"xml">
				: E["op"] extends "root"
					? TypeRoot<E["args"], C>
					: E["op"] extends "parse"
						? WithType<Coerce<E["args"][0], C, "text", "XMLPARSE">, "xml">
						: E["op"] extends "serialize"
							? WithType<
									Coerce<E["args"][0], C, "xml", "XMLSERIALIZE">,
									E["to"]
								>
							: WithType<Coerce<E["args"][0], C, "xml", "IS DOCUMENT">, "bool">;

type TypeRoot<
	Args extends readonly Expr[],
	C extends Ctx,
> = Args extends readonly [
	infer X extends Expr,
	...infer R extends readonly Expr[],
]
	? Coerce<X, C, "xml", "XMLROOT"> extends infer T extends ColInfo
		? CoerceList<R, C, "text", "XMLROOT", []> extends readonly ColInfo[]
			? T
			: CoerceList<R, C, "text", "XMLROOT", []>
		: Coerce<X, C, "xml", "XMLROOT">
	: never;

type WithType<X, T> = X extends ColInfo
	? { readonly type: T; readonly nullable: X["nullable"] }
	: X;

type Coerce<
	A extends Expr,
	C extends Ctx,
	Target extends string,
	Construct extends string,
> =
	TypeOf<A, C> extends infer T extends ColInfo
		? Target extends "text"
			? Info<Target, T["nullable"]>
			: A extends Tag<"str">
				? Info<Target, T["nullable"]>
				: T["type"] extends Target | "unknown" | "null"
					? Info<Target, T["nullable"]>
					: SqlError<
							`argument of ${Construct} must be type ${TypeDisplay<Target>}, not type ${TypeDisplay<T["type"]>}`,
							null
						>
		: TypeOf<A, C>;
type CoerceList<
	Es extends readonly Expr[],
	C extends Ctx,
	Target extends string,
	Construct extends string,
	Acc extends readonly ColInfo[],
> = Es extends readonly [
	infer E extends Expr,
	...infer R extends readonly Expr[],
]
	? Coerce<E, C, Target, Construct> extends infer T extends ColInfo
		? CoerceList<R, C, Target, Construct, [...Acc, T]>
		: Coerce<E, C, Target, Construct>
	: Acc;

export type XmlTableCols<F, C extends Ctx> = F extends {
	readonly ns: infer Ns extends readonly Expr[];
	readonly row: infer Row extends Expr;
	readonly doc: infer Doc extends Expr;
	readonly cols: infer Cs extends readonly XmlTableCol[];
}
	? CoerceList<Ns, C, "text", "XMLTABLE", []> extends readonly ColInfo[]
		? Coerce<Row, C, "text", "XMLTABLE"> extends ColInfo
			? Coerce<Doc, C, "xml", "XMLTABLE"> extends ColInfo
				? XmlCols<Cs, C, [], false>
				: Coerce<Doc, C, "xml", "XMLTABLE">
			: Coerce<Row, C, "text", "XMLTABLE">
		: CoerceList<Ns, C, "text", "XMLTABLE", []>
	: never;

type XmlCols<
	Cs extends readonly XmlTableCol[],
	C extends Ctx,
	Acc extends Cols,
	Ord extends boolean,
> = Cs extends readonly [
	infer D extends XmlTableCol,
	...infer R extends readonly XmlTableCol[],
]
	? D["name"] extends ColNames<Acc>
		? SqlError<`column name "${D["name"]}" is not unique`, null>
		: D["ordinality"] extends true
			? Ord extends true
				? SqlError<"only one FOR ORDINALITY column is allowed", null>
				: XmlCol<D, R, C, Acc, true>
			: XmlCol<D, R, C, Acc, Ord>
	: Acc;
type XmlCol<
	D extends XmlTableCol,
	R extends readonly XmlTableCol[],
	C extends Ctx,
	Acc extends Cols,
	Ord extends boolean,
> = (
	D["path"] extends Expr
		? Coerce<D["path"], C, "text", "XMLTABLE">
		: Info<"text">
) extends infer P
	? P extends ColInfo
		? (D["def"] extends Expr ? TypeOf<D["def"], C> : null) extends infer Df
			? Df extends ColInfo | null
				? XmlCols<
						R,
						C,
						[
							...Acc,
							{
								readonly n: D["name"];
								readonly t: Info<
									D["type"],
									D["notNull"] extends true
										? false
										: Df extends ColInfo
											? Df["nullable"]
											: true
								>;
							},
						],
						Ord
					>
				: Df
			: never
		: P
	: never;
type ColNames<Acc extends Cols> = Acc[number] extends infer E
	? E extends { readonly n: infer N }
		? N
		: never
	: never;

export type ParamsOfXml<
	E extends XmlExpr,
	C extends Ctx,
> = E["op"] extends "element"
	? ParamsOfList<E["named"], C, null> | ParamsOfList<E["args"], C, null>
	: E["op"] extends "forest"
		? ParamsOfList<E["named"], C, null>
		: E["op"] extends "pi" | "parse"
			? ParamsOfList<E["args"], C, Info<"text", true>>
			: E["op"] extends "root"
				? E["args"] extends readonly [
						infer X extends Expr,
						...infer R extends readonly Expr[],
					]
					?
							| ParamsOfOpt<X, C, Info<"xml", true>>
							| ParamsOfList<R, C, Info<"text", true>>
					: never
				: ParamsOfList<E["args"], C, Info<"xml", true>>;

export type ParamsOfXmlTable<F, C extends Ctx> = F extends {
	readonly ns: infer Ns extends readonly Expr[];
	readonly row: infer Row extends Expr;
	readonly doc: infer Doc extends Expr;
	readonly cols: infer Cs extends readonly XmlTableCol[];
}
	?
			| ParamsOfList<Ns, C, Info<"text", true>>
			| ParamsOfOpt<Row, C, Info<"text", true>>
			| ParamsOfOpt<Doc, C, Info<"xml", true>>
			| ParamsOfXmlCols<Cs, C>
	: never;
type ParamsOfXmlCols<
	Cs extends readonly XmlTableCol[],
	C extends Ctx,
> = ParamsOfXmlCol<Cs[number], C>;
type ParamsOfXmlCol<D extends XmlTableCol, C extends Ctx> = D extends unknown
	?
			| ParamsOfOpt<D["path"], C, Info<"text", true>>
			| ParamsOfOpt<
					D["def"],
					C,
					{ readonly type: D["type"]; readonly nullable: true }
			  >
	: never;
