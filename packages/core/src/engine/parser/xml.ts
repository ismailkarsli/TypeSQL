import type { IdTok, OpTok, Toks, WordTok } from "../lexer/tokens.js";
import type { ParseExpr, ParseExprList } from "./expr.js";
import type { ReservedKeyword } from "./keywords.js";
import type { ParseAliasChecked } from "./select.js";
import type { ParseTypeName } from "./typename.js";
import type {
	AnyLabel,
	EatOp,
	EatWord,
	EatWords,
	Expected,
	Fail,
	Ident,
	Nx,
	Ok,
	SyntaxErrorAt,
} from "./util.js";

/**
 * SQL/XML syntax (Postgres's `func_expr_common_subexpr` XML rules, `IS [NOT] DOCUMENT` and
 * `XMLTABLE` in FROM). The expression parser dispatches here only on the `xml*` keywords
 * followed by `(`, so ordinary queries pay one keyword test.
 *
 *   XMLCONCAT(expr, ...)
 *   XMLELEMENT(NAME n [, XMLATTRIBUTES(expr [AS n], ...)] [, expr, ...])
 *   XMLFOREST(expr [AS n], ...)
 *   XMLPI(NAME n [, expr])
 *   XMLROOT(expr, VERSION expr | VERSION NO VALUE [, STANDALONE YES | NO | NO VALUE])
 *   XMLPARSE(DOCUMENT | CONTENT expr [PRESERVE | STRIP WHITESPACE])
 *   XMLSERIALIZE(DOCUMENT | CONTENT expr AS type [[NO] INDENT])
 *   XMLEXISTS(c_expr PASSING [BY REF | BY VALUE] c_expr [BY REF | BY VALUE])
 *
 * Names after NAME / AS are any word or quoted identifier (`name xml`, `AS name`). As in
 * Postgres's parse analysis, an XMLATTRIBUTES / XMLFOREST value without `AS` must be a
 * column reference, and XMLELEMENT's attribute names must be distinct.
 */
export type XmlFuncKeyword =
	| "xmlconcat"
	| "xmlelement"
	| "xmlexists"
	| "xmlforest"
	| "xmlparse"
	| "xmlpi"
	| "xmlroot"
	| "xmlserialize";

type XmlNode<Op extends string, Args, Named, To> = {
	t: "xml";
	op: Op;
	args: Args;
	named: Named;
	to: To;
};

/** `l IS [NOT] DOCUMENT`. */
export type XmlIsDocument<L, Not extends boolean> = Not extends true
	? { t: "un"; op: "not"; e: XmlNode<"document", [L], [], null> }
	: XmlNode<"document", [L], [], null>;

/** `I` is just after `W (`. */
export type ParseXmlFunc<
	T extends Toks,
	W extends XmlFuncKeyword,
	I extends number,
> = W extends "xmlelement"
	? ParseXmlElement<T, I>
	: W extends "xmlforest"
		? ParseNamedList<T, I, false, [], []> extends infer X
			? X extends Ok<infer Named, infer J>
				? Ok<XmlNode<"forest", [], Named, null>, J>
				: X
			: never
		: W extends "xmlconcat"
			? ParseExprList<T, I, []> extends infer X
				? X extends Ok<infer Args, infer J>
					? Close<T, J, XmlNode<"concat", Args, [], null>>
					: X
				: never
			: W extends "xmlpi"
				? ParseXmlPi<T, I>
				: W extends "xmlroot"
					? ParseXmlRoot<T, I>
					: W extends "xmlparse"
						? ParseXmlParse<T, I>
						: W extends "xmlserialize"
							? ParseXmlSerialize<T, I>
							: ParseXmlExists<T, I>;

type Close<T extends Toks, J extends number, N> =
	EatOp<T, J, ")"> extends never
		? Expected<'")"', T, J>
		: Ok<N, EatOp<T, J, ")">>;

/** `NAME label` → `[label, next]` or an error. */
type XmlName<T extends Toks, I extends number> =
	EatWord<T, I, "name"> extends never
		? Expected<"NAME", T, I>
		: AnyLabel<T, EatWord<T, I, "name">> extends [infer N, infer J]
			? [N, J]
			: Expected<"name", T, EatWord<T, I, "name">>;

// ─── XMLELEMENT / XMLFOREST ───

type ParseXmlElement<T extends Toks, I extends number> =
	XmlName<T, I> extends infer R
		? R extends [string, infer J extends number]
			? T[J] extends OpTok<")">
				? Ok<XmlNode<"element", [], [], null>, Nx<J>>
				: T[J] extends OpTok<",">
					? ParseElementBody<T, Nx<J>>
					: Expected<'"," or ")"', T, J>
			: R
		: never;
type ParseElementBody<T extends Toks, I extends number> =
	T[I] extends WordTok<"xmlattributes">
		? T[Nx<I>] extends OpTok<"(">
			? ParseNamedList<T, Nx<Nx<I>>, true, [], []> extends infer X
				? X extends Ok<infer Named, infer J>
					? T[J] extends OpTok<",">
						? ParseElementContent<T, Nx<J>, Named>
						: Close<T, J, XmlNode<"element", [], Named, null>>
					: X
				: never
			: ParseElementContent<T, I, []>
		: ParseElementContent<T, I, []>;
type ParseElementContent<T extends Toks, I extends number, Named> =
	ParseExprList<T, I, []> extends infer X
		? X extends Ok<infer Args, infer J>
			? Close<T, J, XmlNode<"element", Args, Named, null>>
			: X
		: never;

/**
 * `expr [AS label], ... )` (XMLATTRIBUTES / XMLFOREST, `I` just after `(`) → `Ok<values, after ")">`.
 * `Attr`: XMLATTRIBUTES (its own messages; names must be distinct).
 */
type ParseNamedList<
	T extends Toks,
	I extends number,
	Attr extends boolean,
	Vals extends readonly unknown[],
	Names extends readonly string[],
> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer E, infer J>
			? (
					T[J] extends WordTok<"as">
						? AnyLabel<T, Nx<J>> extends [infer N, infer J2]
							? [N, J2]
							: Expected<"name", T, Nx<J>>
						: E extends {
									readonly t: "col";
									readonly name: infer N;
								}
							? [N, J]
							: Fail<
									Attr extends true
										? "unnamed XML attribute value must be a column reference"
										: "unnamed XML element value must be a column reference",
									I
								>
				) extends infer NR
				? NR extends [infer N extends string, infer J2 extends number]
					? Attr extends true
						? N extends Names[number]
							? Fail<`XML attribute name "${N}" appears more than once`, I>
							: NamedNext<T, J2, Attr, [...Vals, E], [...Names, N]>
						: NamedNext<T, J2, Attr, [...Vals, E], Names>
					: NR
				: never
			: X
		: never;
type NamedNext<
	T extends Toks,
	J extends number,
	Attr extends boolean,
	Vals extends readonly unknown[],
	Names extends readonly string[],
> =
	T[J] extends OpTok<",">
		? ParseNamedList<T, Nx<J>, Attr, Vals, Names>
		: T[J] extends OpTok<")">
			? Ok<Vals, Nx<J>>
			: Expected<'"," or ")"', T, J>;

// ─── XMLPI / XMLROOT / XMLPARSE / XMLSERIALIZE / XMLEXISTS ───

type ParseXmlPi<T extends Toks, I extends number> =
	XmlName<T, I> extends infer R
		? R extends [string, infer J extends number]
			? T[J] extends OpTok<")">
				? Ok<XmlNode<"pi", [], [], null>, Nx<J>>
				: T[J] extends OpTok<",">
					? ParseExpr<T, Nx<J>, 0> extends infer X
						? X extends Ok<infer E, infer J2>
							? Close<T, J2, XmlNode<"pi", [E], [], null>>
							: X
						: never
					: Expected<'"," or ")"', T, J>
			: R
		: never;

type ParseXmlRoot<T extends Toks, I extends number> =
	ParseExpr<T, I, 0> extends infer X
		? X extends Ok<infer E, infer J>
			? EatOp<T, J, ","> extends never
				? Expected<'","', T, J>
				: EatWord<T, EatOp<T, J, ",">, "version"> extends never
					? Expected<"VERSION", T, EatOp<T, J, ",">>
					: RootVersion<
								T,
								EatWord<T, EatOp<T, J, ",">, "version">
							> extends infer V
						? V extends Ok<infer Ver, infer J2>
							? RootStandalone<T, J2> extends infer S
								? S extends number
									? Close<
											T,
											S,
											XmlNode<
												"root",
												Ver extends null ? [E] : [E, Ver],
												[],
												null
											>
										>
									: S
								: never
							: V
						: never
			: X
		: never;
/** `NO VALUE` → `Ok<null, next>`, else the version expression. */
type RootVersion<T extends Toks, I extends number> =
	EatWords<T, I, ["no", "value"]> extends never
		? ParseExpr<T, I, 0>
		: Ok<null, EatWords<T, I, ["no", "value"]>>;
/** `[, STANDALONE YES | NO | NO VALUE]` → next index or an error. */
type RootStandalone<T extends Toks, I extends number> =
	EatOp<T, I, ","> extends never
		? I
		: EatWord<T, EatOp<T, I, ",">, "standalone"> extends never
			? Expected<"STANDALONE", T, EatOp<T, I, ",">>
			: StandaloneValue<T, EatWord<T, EatOp<T, I, ",">, "standalone">>;
type StandaloneValue<T extends Toks, I extends number> =
	EatWords<T, I, ["no", "value"]> extends never
		? EatWord<T, I, "yes" | "no"> extends never
			? Expected<"YES, NO or NO VALUE", T, I>
			: EatWord<T, I, "yes" | "no">
		: EatWords<T, I, ["no", "value"]>;

type ParseXmlParse<T extends Toks, I extends number> =
	EatWord<T, I, "document" | "content"> extends never
		? Expected<"DOCUMENT or CONTENT", T, I>
		: ParseExpr<T, EatWord<T, I, "document" | "content">, 0> extends infer X
			? X extends Ok<infer E, infer J>
				? Close<T, SkipWhitespaceOption<T, J>, XmlNode<"parse", [E], [], null>>
				: X
			: never;
/** `[PRESERVE | STRIP] WHITESPACE` → next index (`EatWord` at a `never` index is `never`). */
type SkipWhitespaceOption<T extends Toks, I extends number> =
	EatWord<T, EatWord<T, I, "preserve" | "strip">, "whitespace"> extends never
		? I
		: EatWord<T, EatWord<T, I, "preserve" | "strip">, "whitespace">;

type ParseXmlSerialize<T extends Toks, I extends number> =
	EatWord<T, I, "document" | "content"> extends never
		? Expected<"DOCUMENT or CONTENT", T, I>
		: ParseExpr<T, EatWord<T, I, "document" | "content">, 0> extends infer X
			? X extends Ok<infer E, infer J>
				? EatWord<T, J, "as"> extends never
					? Expected<"AS", T, J>
					: ParseTypeName<T, EatWord<T, J, "as">> extends infer Y
						? Y extends Ok<infer Ty, infer J2>
							? Close<T, SkipIndent<T, J2>, XmlNode<"serialize", [E], [], Ty>>
							: Y
						: never
				: X
			: never;
type SkipIndent<T extends Toks, I extends number> =
	EatWord<T, I, "indent"> extends never
		? EatWords<T, I, ["no", "indent"]> extends never
			? I
			: EatWords<T, I, ["no", "indent"]>
		: EatWord<T, I, "indent">;

/** `XMLEXISTS(x PASSING d)` is Postgres's function `xmlexists(text, xml)`; both operands are `c_expr`s. */
type ParseXmlExists<T extends Toks, I extends number> =
	ParseExpr<T, I, 13> extends infer X
		? X extends Ok<infer Path, infer J>
			? EatWord<T, J, "passing"> extends never
				? Expected<"PASSING", T, J>
				: ParseExpr<
							T,
							SkipMech<T, EatWord<T, J, "passing">>,
							13
						> extends infer Y
					? Y extends Ok<infer Doc, infer J2>
						? Close<
								T,
								SkipMech<T, J2>,
								{
									t: "call";
									name: "xmlexists";
									args: [Path, Doc];
									distinct: false;
									filter: null;
									over: false;
									win: null;
									withinGroup: null;
								}
							>
						: Y
					: never
			: X
		: never;
/** `BY REF` / `BY VALUE` (no effect; `EatWord` at a `never` index is `never`). */
type SkipMech<T extends Toks, I extends number> =
	EatWord<T, EatWord<T, I, "by">, "ref" | "value"> extends never
		? I
		: EatWord<T, EatWord<T, I, "by">, "ref" | "value">;

// ─── XMLTABLE ───

/**
 * `XMLTABLE(` … `) [alias [(cols)]]` in FROM; `I` is just after `(`. Namespace URIs, PATH
 * and DEFAULT are `b_expr`s, the row and document expressions `c_expr`s.
 */
export type ParseXmlTable<T extends Toks, I extends number> = (
	T[I] extends WordTok<"xmlnamespaces">
		? T[Nx<I>] extends OpTok<"(">
			? ParseNamespaces<T, Nx<Nx<I>>, []>
			: Ok<[[], false], I>
		: Ok<[[], false], I>
) extends infer NS
	? NS extends Ok<[infer Ns, infer Dflt], infer I1>
		? ParseExpr<T, I1, 13> extends infer R
			? R extends Ok<infer Row, infer I2>
				? EatWord<T, I2, "passing"> extends never
					? Expected<"PASSING", T, I2>
					: ParseExpr<
								T,
								SkipMech<T, EatWord<T, I2, "passing">>,
								13
							> extends infer D
						? D extends Ok<infer Doc, infer I3>
							? EatWord<T, SkipMech<T, I3>, "columns"> extends never
								? Expected<"COLUMNS", T, SkipMech<T, I3>>
								: ParseXmlCols<
											T,
											EatWord<T, SkipMech<T, I3>, "columns">,
											[]
										> extends infer CS
									? CS extends Ok<infer Cols, infer I4>
										? EatOp<T, I4, ")"> extends never
											? Expected<'")"', T, I4>
											: ParseAliasChecked<T, EatOp<T, I4, ")">> extends infer AR
												? AR extends [infer A, infer CA, infer J extends number]
													? Ok<
															{
																t: "xmltable";
																ns: Ns;
																defaultNs: Dflt;
																row: Row;
																doc: Doc;
																cols: Cols;
																alias: A;
																colAliases: CA;
															},
															J
														>
													: AR
												: never
										: CS
									: never
							: D
						: never
				: R
			: never
		: NS
	: never;

/**
 * `uri AS name | DEFAULT uri, ... ) ,` (`I` just after `(`) → `Ok<[uris, has DEFAULT], after the ",">`.
 * Postgres parses a DEFAULT namespace and rejects it in parse analysis (the binder does too).
 */
type ParseNamespaces<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Dflt extends boolean = false,
> =
	T[I] extends WordTok<"default">
		? ParseExpr<T, Nx<I>, 5> extends infer X
			? X extends Ok<infer E, infer J>
				? NamespacesNext<T, J, [...Acc, E], true>
				: X
			: never
		: ParseExpr<T, I, 5> extends infer X
			? X extends Ok<infer E, infer J>
				? EatWord<T, J, "as"> extends never
					? Expected<"AS", T, J>
					: AnyLabel<T, EatWord<T, J, "as">> extends [
								string,
								infer J2 extends number,
							]
						? NamespacesNext<T, J2, [...Acc, E], Dflt>
						: Expected<"name", T, EatWord<T, J, "as">>
				: X
			: never;
type NamespacesNext<
	T extends Toks,
	J extends number,
	Acc extends readonly unknown[],
	Dflt extends boolean,
> =
	T[J] extends OpTok<",">
		? ParseNamespaces<T, Nx<J>, Acc, Dflt>
		: T[J] extends OpTok<")">
			? EatOp<T, Nx<J>, ","> extends never
				? Expected<'","', T, Nx<J>>
				: Ok<[Acc, Dflt], EatOp<T, Nx<J>, ",">>
			: Expected<'"," or ")"', T, J>;

/** `name type [options] | name FOR ORDINALITY`, comma-separated → `Ok<columns, next>`. */
type ParseXmlCols<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	Ident<T, I> extends [infer N extends string, infer J extends number]
		? EatWords<T, J, ["for", "ordinality"]> extends never
			? ParseTypeName<T, J> extends infer X
				? X extends Ok<infer Ty extends string, infer J2>
					? ParseColOptions<T, J2, N, Ty, null, null, null, Acc>
					: X
				: never
			: XmlColsNext<
					T,
					EatWords<T, J, ["for", "ordinality"]>,
					[
						...Acc,
						{
							name: N;
							type: "int4";
							path: null;
							def: null;
							notNull: true;
							ordinality: true;
						},
					]
				>
		: Expected<"column name", T, I>;
type XmlColsNext<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> = T[I] extends OpTok<","> ? ParseXmlCols<T, Nx<I>, Acc> : Ok<Acc, I>;

/** `PATH p | DEFAULT d | NOT NULL | NULL` in any order, each at most once (Postgres's messages). */
type ParseColOptions<
	T extends Toks,
	I extends number,
	N extends string,
	Ty extends string,
	Path,
	Def,
	NN,
	Acc extends readonly unknown[],
> =
	T[I] extends WordTok<infer W>
		? W extends "path"
			? Path extends null
				? ParseExpr<T, Nx<I>, 5> extends infer X
					? X extends Ok<infer E, infer J>
						? ParseColOptions<T, J, N, Ty, E, Def, NN, Acc>
						: X
					: never
				: Fail<"only one PATH value per column is allowed", I>
			: W extends "default"
				? Def extends null
					? ParseExpr<T, Nx<I>, 5> extends infer X
						? X extends Ok<infer E, infer J>
							? ParseColOptions<T, J, N, Ty, Path, E, NN, Acc>
							: X
						: never
					: Fail<"only one DEFAULT value is allowed", I>
				: W extends "not"
					? T[Nx<I>] extends WordTok<"null">
						? NN extends null
							? ParseColOptions<T, Nx<Nx<I>>, N, Ty, Path, Def, true, Acc>
							: Fail<
									`conflicting or redundant NULL / NOT NULL declarations for column "${N}"`,
									I
								>
						: SyntaxErrorAt<T, Nx<I>>
					: W extends "null"
						? NN extends null
							? ParseColOptions<T, Nx<I>, N, Ty, Path, Def, false, Acc>
							: Fail<
									`conflicting or redundant NULL / NOT NULL declarations for column "${N}"`,
									I
								>
						: W extends ReservedKeyword
							? ColDone<T, I, N, Ty, Path, Def, NN, Acc>
							: UnknownColOption<T, I, W>
		: T[I] extends IdTok<infer W>
			? UnknownColOption<T, I, W>
			: ColDone<T, I, N, Ty, Path, Def, NN, Acc>;
/** The column's options end at `I`: add it and go on. */
type ColDone<
	T extends Toks,
	I extends number,
	N extends string,
	Ty extends string,
	Path,
	Def,
	NN,
	Acc extends readonly unknown[],
> = XmlColsNext<
	T,
	I,
	[
		...Acc,
		{
			name: N;
			type: Ty;
			path: Path;
			def: Def;
			notNull: NN extends true ? true : false;
			ordinality: false;
		},
	]
>;
/** `IDENT b_expr`: Postgres parses any option name, then rejects the unknown ones. */
type UnknownColOption<T extends Toks, I extends number, W extends string> =
	ParseExpr<T, Nx<I>, 5> extends infer X
		? X extends Ok<unknown, number>
			? Fail<
					W extends "__pg__is_not_null"
						? `option name "${W}" cannot be used in XMLTABLE`
						: `unrecognized column option "${W}"`,
					I
				>
			: X
		: never;
