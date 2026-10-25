import type { Expr, XmlTableCol } from "../ast.js";
import type { TypeDisplay } from "../binder/clauses.js";
import type { SqlError } from "../errors.js";
import type { ColInfo, Cols, Ctx, Info } from "../types.js";
import type { ParamsOfList, ParamsOfOpt } from "./params.js";
import type { TypeList, TypeOf } from "./typeof.js";

/**
 * SQL/XML typing (verified against PostgreSQL 18, `transformXmlExpr` / `ExecEvalXmlExpr`):
 *
 *   XMLELEMENT                → xml, never null (NULL content and attributes are skipped)
 *   XMLFOREST, XMLCONCAT      → xml, null only when every value is (NULLs are skipped)
 *   XMLPI(NAME n, arg)        → xml, null when arg is
 *   XMLROOT(x, VERSION v ...) → xml, null when x is (a NULL version means NO VALUE)
 *   XMLPARSE(... arg)         → xml, null when arg is
 *   XMLSERIALIZE(... AS T)    → T, null when the value is
 *   x IS [NOT] DOCUMENT       → bool, null when x is
 *   XMLEXISTS                 → the function xmlexists(text, xml) (catalog)
 *
 * Operands are coerced like Postgres's `coerce_to_specific_type` (see `Coerce`): a non-xml
 * value where xml is required is `argument of XMLCONCAT must be type xml, not type integer`.
 */
export type TypeXml<E extends Expr, C extends Ctx> = E["op"] extends "element"
	? TypeList<E["named"], C, []> extends infer Ls
		? Ls extends readonly ColInfo[]
			? TypeList<E["args"], C, []> extends infer As
				? As extends readonly ColInfo[]
					? Info<"xml">
					: As
				: never
			: Ls
		: never
	: E["op"] extends "forest"
		? TypeList<E["named"], C, []> extends infer Ls
			? Ls extends readonly ColInfo[]
				? Info<"xml", AllNullable<Ls>>
				: Ls
			: never
		: E["op"] extends "concat"
			? CoerceList<E["args"], C, "xml", "XMLCONCAT", []> extends infer Ls
				? Ls extends readonly ColInfo[]
					? Info<"xml", AllNullable<Ls>>
					: Ls
				: never
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
	? Coerce<X, C, "xml", "XMLROOT"> extends infer T
		? T extends ColInfo
			? CoerceList<R, C, "text", "XMLROOT", []> extends infer V
				? V extends readonly ColInfo[]
					? T
					: V
				: never
			: T
		: never
	: never;

type WithType<X, T> = X extends ColInfo
	? { readonly type: T; readonly nullable: X["nullable"] }
	: X;
type AllNullable<As extends readonly ColInfo[]> = As extends readonly [
	infer A extends ColInfo,
	...infer R extends readonly ColInfo[],
]
	? A["nullable"] extends true
		? AllNullable<R>
		: false
	: true;

/**
 * `coerce_to_specific_type` (assignment coercion): the operand as `Target` (same
 * nullability), or Postgres's error. Every type has an assignment cast to text (I/O
 * conversion); only xml (or an untyped literal, NULL or `$n`) becomes xml.
 */
export type Coerce<
	A extends Expr,
	C extends Ctx,
	Target extends string,
	Construct extends string,
> =
	TypeOf<A, C> extends infer T
		? T extends ColInfo
			? Target extends "text"
				? Info<Target, T["nullable"]>
				: A extends { readonly t: "str" }
					? Info<Target, T["nullable"]>
					: T["type"] extends Target | "unknown" | "null"
						? Info<Target, T["nullable"]>
						: SqlError<
								`argument of ${Construct} must be type ${TypeDisplay<Target>}, not type ${TypeDisplay<T["type"]>}`,
								null
							>
			: T
		: never;
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
	? Coerce<E, C, Target, Construct> extends infer T
		? T extends ColInfo
			? CoerceList<R, C, Target, Construct, [...Acc, T]>
			: T
		: never
	: Acc;

// ─── XMLTABLE ───

/**
 * Columns of an XMLTABLE, after checking its expressions (namespace URIs, row and column
 * paths are text, the document xml). A column is NULL when its path matches nothing: it is
 * nullable unless declared NOT NULL (Postgres raises an error instead) or given a DEFAULT,
 * which then decides. FOR ORDINALITY is a non-null int4.
 */
export type XmlTableCols<F, C extends Ctx> = F extends {
	readonly ns: infer Ns extends readonly Expr[];
	readonly row: infer Row extends Expr;
	readonly doc: infer Doc extends Expr;
	readonly cols: infer Cs extends readonly XmlTableCol[];
}
	? CoerceList<Ns, C, "text", "XMLTABLE", []> extends infer N
		? N extends readonly ColInfo[]
			? Coerce<Row, C, "text", "XMLTABLE"> extends infer R
				? R extends ColInfo
					? Coerce<Doc, C, "xml", "XMLTABLE"> extends infer D
						? D extends ColInfo
							? XmlCols<Cs, C, [], false>
							: D
						: never
					: R
				: never
			: N
		: never
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
/** One column (FOR ORDINALITY is a NOT NULL int4 without PATH or DEFAULT), then the rest. */
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

// ─── parameters ───

/** `$n` in XML forms: the type each operand is coerced to; XMLELEMENT / XMLFOREST values stay untyped. */
export type ParamsOfXml<
	E extends Expr,
	C extends Ctx,
	M,
> = E["op"] extends "element"
	? ParamsOfList<E["args"], C, ParamsOfList<E["named"], C, M, null>, null>
	: E["op"] extends "forest"
		? ParamsOfList<E["named"], C, M, null>
		: E["op"] extends "pi" | "parse"
			? ParamsOfList<E["args"], C, M, Info<"text", true>>
			: E["op"] extends "root"
				? E["args"] extends readonly [
						infer X extends Expr,
						...infer R extends readonly Expr[],
					]
					? ParamsOfList<
							R,
							C,
							ParamsOfOpt<X, C, M, Info<"xml", true>>,
							Info<"text", true>
						>
					: never
				: ParamsOfList<E["args"], C, M, Info<"xml", true>>;

/** XMLTABLE: URIs, row and column paths text, the document xml, a DEFAULT the column's type. */
export type ParamsOfXmlTable<F, C extends Ctx, M> = F extends {
	readonly ns: infer Ns extends readonly Expr[];
	readonly row: infer Row extends Expr;
	readonly doc: infer Doc extends Expr;
	readonly cols: infer Cs extends readonly XmlTableCol[];
}
	? ParamsOfXmlCols<
			Cs,
			C,
			ParamsOfOpt<
				Doc,
				C,
				ParamsOfOpt<
					Row,
					C,
					ParamsOfList<Ns, C, M, Info<"text", true>>,
					Info<"text", true>
				>,
				Info<"xml", true>
			>
		>
	: never;
type ParamsOfXmlCols<
	Cs extends readonly XmlTableCol[],
	C extends Ctx,
	M,
> = Cs extends readonly [
	infer D extends XmlTableCol,
	...infer R extends readonly XmlTableCol[],
]
	? ParamsOfXmlCols<
			R,
			C,
			ParamsOfOpt<
				D["def"],
				C,
				ParamsOfOpt<D["path"], C, M, Info<"text", true>>,
				{ readonly type: D["type"]; readonly nullable: true }
			>
		>
	: M;
