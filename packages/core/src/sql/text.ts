import type { AnyErr } from "../errors.js";
import type { RewriteInlineStr } from "./inline.js";
import type { Lexis } from "./lexis.js";
import type { RewriteNamed, RewriteNamedStr } from "./named.js";
import type { MaxParamStr } from "./splice.js";

export type IsLiteral<Q extends string> = string extends Q
	? false
	: {} extends Record<Q, 1>
		? false
		: true;

export type NotLiteralMessage =
	"the SQL text is not a string literal: pass values as parameters ($1, :name or ${sql.param(value)}), identifiers with sql.id(), reusable pieces as ${fragment}, or use sql.as<Row>() for dynamic SQL";

export type Prepared<Q extends string, L extends Lexis> =
	RewriteNamedStr<Q, L> extends [
		infer T1 extends string,
		infer Names extends string[],
	]
		? Names extends []
			? WithInline<T1, Names, MaxParamStr<T1, L>, L>
			: MaxParamStr<Q, L> extends 0
				? WithInline<T1, Names, Names["length"], L>
				: RewriteNamed<Q, L>
		: never;

type WithInline<
	T1 extends string,
	Names extends string[],
	M extends number,
	L extends Lexis,
> =
	RewriteInlineStr<T1, M, L> extends infer R
		? R extends [infer T2 extends string, infer Encs extends string[]]
			? [T2, Names, Encs, M]
			: R
		: never;

export type PText<Q extends string, L extends Lexis> =
	Prepared<Q, L> extends [infer X extends string, ...unknown[]] ? X : Q;

export type Surface<R> = [Extract<R, AnyErr>] extends [never]
	? [R] extends [never]
		? never
		: unknown
	: Extract<R, AnyErr>;
