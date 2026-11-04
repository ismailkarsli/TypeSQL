import type { IdTok, OpTok, Toks, WordTok } from "../../../engine/tokens.js";
import type { CallOf, ParseExpr, ParseExprList } from "./expr.js";
import type { ReservedKeyword } from "./keywords.js";
import type { ParseAliasChecked } from "./select.js";
import type { ParseTypeName } from "./typename.js";
import type {
	AnyLabel,
	Close,
	EatOp,
	EatWord,
	EatWords,
	Expected,
	Fail,
	Ident,
	Nx,
	Nx2,
	Ok,
	SkipFirst,
	SkipWords,
	SyntaxErrorAt,
} from "./util.js";

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

export type XmlIsDocument<L, Not extends boolean> = Not extends true
	? { t: "un"; op: "not"; e: XmlNode<"document", [L], [], null> }
	: XmlNode<"document", [L], [], null>;

export type ParseXmlFunc<
	T extends Toks,
	W extends XmlFuncKeyword,
	I extends number,
> = W extends "xmlelement"
	? ParseXmlElement<T, I>
	: W extends "xmlforest"
		? ParseNamedList<T, I, false, [], []> extends Ok<infer Named, infer J>
			? Ok<XmlNode<"forest", [], Named, null>, J>
			: ParseNamedList<T, I, false, [], []>
		: W extends "xmlconcat"
			? ParseExprList<T, I, []> extends Ok<infer Args, infer J>
				? Close<T, J, XmlNode<"concat", Args, [], null>>
				: ParseExprList<T, I, []>
			: W extends "xmlpi"
				? ParseXmlPi<T, I>
				: W extends "xmlroot"
					? ParseXmlRoot<T, I>
					: W extends "xmlparse"
						? ParseXmlParse<T, I>
						: W extends "xmlserialize"
							? ParseXmlSerialize<T, I>
							: ParseXmlExists<T, I>;

type XmlName<T extends Toks, I extends number> =
	EatWord<T, I, "name"> extends never
		? Expected<"NAME", T, I>
		: AnyLabel<T, Nx<I>> extends [infer N, infer J]
			? [N, J]
			: Expected<"name", T, Nx<I>>;

type ParseXmlElement<T extends Toks, I extends number> =
	XmlName<T, I> extends [string, infer J extends number]
		? T[J] extends OpTok<")">
			? Ok<XmlNode<"element", [], [], null>, Nx<J>>
			: T[J] extends OpTok<",">
				? ParseElementBody<T, Nx<J>>
				: Expected<'"," or ")"', T, J>
		: XmlName<T, I>;
type ParseElementBody<T extends Toks, I extends number> =
	T[I] extends WordTok<"xmlattributes">
		? T[Nx<I>] extends OpTok<"(">
			? ParseNamedList<T, Nx2<I>, true, [], []> extends Ok<infer Named, infer J>
				? T[J] extends OpTok<",">
					? ParseElementContent<T, Nx<J>, Named>
					: Close<T, J, XmlNode<"element", [], Named, null>>
				: ParseNamedList<T, Nx2<I>, true, [], []>
			: ParseElementContent<T, I, []>
		: ParseElementContent<T, I, []>;
type ParseElementContent<T extends Toks, I extends number, Named> =
	ParseExprList<T, I, []> extends Ok<infer Args, infer J>
		? Close<T, J, XmlNode<"element", Args, Named, null>>
		: ParseExprList<T, I, []>;

type ParseNamedList<
	T extends Toks,
	I extends number,
	Attr extends boolean,
	Vals extends readonly unknown[],
	Names extends readonly string[],
> =
	ParseExpr<T, I, 0> extends Ok<infer E, infer J>
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
		: ParseExpr<T, I, 0>;
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

type ParseXmlPi<T extends Toks, I extends number> =
	XmlName<T, I> extends [string, infer J extends number]
		? T[J] extends OpTok<")">
			? Ok<XmlNode<"pi", [], [], null>, Nx<J>>
			: T[J] extends OpTok<",">
				? ParseExpr<T, Nx<J>, 0> extends Ok<infer E, infer J2>
					? Close<T, J2, XmlNode<"pi", [E], [], null>>
					: ParseExpr<T, Nx<J>, 0>
				: Expected<'"," or ")"', T, J>
		: XmlName<T, I>;

type ParseXmlRoot<T extends Toks, I extends number> =
	ParseExpr<T, I, 0> extends Ok<infer E, infer J>
		? EatOp<T, J, ","> extends never
			? Expected<'","', T, J>
			: EatWord<T, Nx<J>, "version"> extends never
				? Expected<"VERSION", T, Nx<J>>
				: RootVersion<T, Nx2<J>> extends Ok<infer Ver, infer J2>
					? RootStandalone<T, J2> extends infer S extends number
						? Close<
								T,
								S,
								XmlNode<"root", Ver extends null ? [E] : [E, Ver], [], null>
							>
						: RootStandalone<T, J2>
					: RootVersion<T, Nx2<J>>
		: ParseExpr<T, I, 0>;
type RootVersion<T extends Toks, I extends number> =
	EatWords<T, I, ["no", "value"]> extends never
		? ParseExpr<T, I, 0>
		: Ok<null, Nx2<I>>;
type RootStandalone<T extends Toks, I extends number> =
	EatOp<T, I, ","> extends never
		? I
		: EatWord<T, Nx<I>, "standalone"> extends never
			? Expected<"STANDALONE", T, Nx<I>>
			: StandaloneValue<T, Nx2<I>>;
type StandaloneValue<T extends Toks, I extends number> =
	EatWords<T, I, ["no", "value"]> extends never
		? EatWord<T, I, "yes" | "no"> extends never
			? Expected<"YES, NO or NO VALUE", T, I>
			: Nx<I>
		: Nx2<I>;

type ParseXmlParse<T extends Toks, I extends number> =
	EatWord<T, I, "document" | "content"> extends never
		? Expected<"DOCUMENT or CONTENT", T, I>
		: ParseExpr<T, Nx<I>, 0> extends Ok<infer E, infer J>
			? Close<
					T,
					SkipWords<T, J, ["preserve" | "strip", "whitespace"]>,
					XmlNode<"parse", [E], [], null>
				>
			: ParseExpr<T, Nx<I>, 0>;
type ParseXmlSerialize<T extends Toks, I extends number> =
	EatWord<T, I, "document" | "content"> extends never
		? Expected<"DOCUMENT or CONTENT", T, I>
		: ParseExpr<T, Nx<I>, 0> extends Ok<infer E, infer J>
			? EatWord<T, J, "as"> extends never
				? Expected<"AS", T, J>
				: ParseTypeName<T, Nx<J>> extends Ok<infer Ty, infer J2>
					? Close<
							T,
							SkipFirst<T, J2, [["indent"], ["no", "indent"]]>,
							XmlNode<"serialize", [E], [], Ty>
						>
					: ParseTypeName<T, Nx<J>>
			: ParseExpr<T, Nx<I>, 0>;
type ParseXmlExists<T extends Toks, I extends number> =
	ParseExpr<T, I, 13> extends Ok<infer Path, infer J>
		? EatWord<T, J, "passing"> extends never
			? Expected<"PASSING", T, J>
			: ParseExpr<T, SkipMech<T, Nx<J>>, 13> extends Ok<infer Doc, infer J2>
				? Close<T, SkipMech<T, J2>, CallOf<"xmlexists", [Path, Doc]>>
				: ParseExpr<T, SkipMech<T, Nx<J>>, 13>
		: ParseExpr<T, I, 13>;
type SkipMech<T extends Toks, I extends number> = SkipWords<
	T,
	I,
	["by", "ref" | "value"]
>;

export type ParseXmlTable<T extends Toks, I extends number> = (
	T[I] extends WordTok<"xmlnamespaces">
		? T[Nx<I>] extends OpTok<"(">
			? ParseNamespaces<T, Nx2<I>, []>
			: Ok<[[], false], I>
		: Ok<[[], false], I>
) extends infer NS
	? NS extends Ok<[infer Ns, infer Dflt], infer I1>
		? ParseExpr<T, I1, 13> extends Ok<infer Row, infer I2>
			? EatWord<T, I2, "passing"> extends never
				? Expected<"PASSING", T, I2>
				: ParseExpr<T, SkipMech<T, Nx<I2>>, 13> extends Ok<infer Doc, infer I3>
					? EatWord<T, SkipMech<T, I3>, "columns"> extends never
						? Expected<"COLUMNS", T, SkipMech<T, I3>>
						: ParseXmlCols<T, Nx<SkipMech<T, I3>>, []> extends infer CS
							? CS extends Ok<infer Cols, infer I4>
								? EatOp<T, I4, ")"> extends never
									? Expected<'")"', T, I4>
									: ParseAliasChecked<T, Nx<I4>> extends [
												infer A,
												infer CA,
												infer J extends number,
											]
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
										: ParseAliasChecked<T, Nx<I4>>
								: CS
							: never
					: ParseExpr<T, SkipMech<T, Nx<I2>>, 13>
			: ParseExpr<T, I1, 13>
		: NS
	: never;

type ParseNamespaces<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
	Dflt extends boolean = false,
> =
	T[I] extends WordTok<"default">
		? ParseExpr<T, Nx<I>, 5> extends Ok<infer E, infer J>
			? NamespacesNext<T, J, [...Acc, E], true>
			: ParseExpr<T, Nx<I>, 5>
		: ParseExpr<T, I, 5> extends Ok<infer E, infer J>
			? EatWord<T, J, "as"> extends never
				? Expected<"AS", T, J>
				: AnyLabel<T, Nx<J>> extends [string, infer J2 extends number]
					? NamespacesNext<T, J2, [...Acc, E], Dflt>
					: Expected<"name", T, Nx<J>>
			: ParseExpr<T, I, 5>;
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
				: Ok<[Acc, Dflt], Nx2<J>>
			: Expected<'"," or ")"', T, J>;

type ParseXmlCols<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> =
	Ident<T, I> extends [infer N extends string, infer J extends number]
		? EatWords<T, J, ["for", "ordinality"]> extends never
			? ParseTypeName<T, J> extends Ok<infer Ty extends string, infer J2>
				? ParseColOptions<T, J2, N, Ty, null, null, null, Acc>
				: ParseTypeName<T, J>
			: XmlColsNext<
					T,
					Nx2<J>,
					[...Acc, XmlCol<N, "int4", null, null, true, true>]
				>
		: Expected<"column name", T, I>;
type XmlColsNext<
	T extends Toks,
	I extends number,
	Acc extends readonly unknown[],
> = T[I] extends OpTok<","> ? ParseXmlCols<T, Nx<I>, Acc> : Ok<Acc, I>;

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
				? ParseExpr<T, Nx<I>, 5> extends Ok<infer E, infer J>
					? ParseColOptions<T, J, N, Ty, E, Def, NN, Acc>
					: ParseExpr<T, Nx<I>, 5>
				: Fail<"only one PATH value per column is allowed", I>
			: W extends "default"
				? Def extends null
					? ParseExpr<T, Nx<I>, 5> extends Ok<infer E, infer J>
						? ParseColOptions<T, J, N, Ty, Path, E, NN, Acc>
						: ParseExpr<T, Nx<I>, 5>
					: Fail<"only one DEFAULT value is allowed", I>
				: W extends "not"
					? T[Nx<I>] extends WordTok<"null">
						? NN extends null
							? ParseColOptions<T, Nx2<I>, N, Ty, Path, Def, true, Acc>
							: NullConflict<N, I>
						: SyntaxErrorAt<T, Nx<I>>
					: W extends "null"
						? NN extends null
							? ParseColOptions<T, Nx<I>, N, Ty, Path, Def, false, Acc>
							: NullConflict<N, I>
						: W extends ReservedKeyword
							? ColDone<T, I, N, Ty, Path, Def, NN, Acc>
							: UnknownColOption<T, I, W>
		: T[I] extends IdTok<infer W>
			? UnknownColOption<T, I, W>
			: ColDone<T, I, N, Ty, Path, Def, NN, Acc>;
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
	[...Acc, XmlCol<N, Ty, Path, Def, NN extends true ? true : false, false>]
>;
type XmlCol<N, Ty, Path, Def, NN, Ord> = {
	name: N;
	type: Ty;
	path: Path;
	def: Def;
	notNull: NN;
	ordinality: Ord;
};
type NullConflict<N extends string, I extends number> = Fail<
	`conflicting or redundant NULL / NOT NULL declarations for column "${N}"`,
	I
>;
type UnknownColOption<T extends Toks, I extends number, W extends string> =
	ParseExpr<T, Nx<I>, 5> extends Ok<unknown, number>
		? Fail<
				W extends "__pg__is_not_null"
					? `option name "${W}" cannot be used in XMLTABLE`
					: `unrecognized column option "${W}"`,
				I
			>
		: ParseExpr<T, Nx<I>, 5>;
