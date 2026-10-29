import type { AnyErr, SqlError } from "../engine/errors.js";
import type { RewriteInlineStr } from "../engine/inline.js";
import type { RewriteNamedStr } from "../engine/named.js";
import type { MaxParamStr } from "../engine/splice.js";

export type IsLiteral<Q extends string> = string extends Q
	? false
	: {} extends Record<Q, 1>
		? false
		: true;

export type NotLiteralMessage =
	"the SQL text is not a string literal: pass values as parameters ($1, :name or ${sql.param(value)}), identifiers with sql.id(), reusable pieces as {slot} fragments, or use sql.as<Row>() for dynamic SQL";

export type Prepared<Q extends string> =
	RewriteNamedStr<Q> extends [
		infer T1 extends string,
		infer Names extends string[],
	]
		? Names extends []
			? WithInline<T1, Names, MaxParamStr<T1>>
			: MaxParamStr<Q> extends 0
				? WithInline<T1, Names, Names["length"]>
				: SqlError<
						"cannot mix named (:name) and positional ($n) parameters",
						null
					>
		: never;

type WithInline<T1 extends string, Names extends string[], M extends number> =
	RewriteInlineStr<T1, M> extends infer R
		? R extends [infer T2 extends string, infer Encs extends string[]]
			? [T2, Names, Encs, M]
			: R
		: never;

export type PText<Q extends string> =
	Prepared<Q> extends [infer X extends string, ...unknown[]] ? X : Q;

export type Surface<R> = [Extract<R, AnyErr>] extends [never]
	? [R] extends [never]
		? never
		: unknown
	: Extract<R, AnyErr>;
