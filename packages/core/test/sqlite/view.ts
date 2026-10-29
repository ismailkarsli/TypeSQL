import type { AnyErr, SqlError } from "../../src/errors.js";
import type { UnionList } from "../../src/sql/splice.js";
import type { Analysis, ApplyDdl } from "../../src/sqlite/engine/infer.js";

type Join<
	L extends readonly unknown[],
	Sep extends string,
	Acc extends string = "",
> = L extends readonly [infer H extends string, ...infer R]
	? Join<R, Sep, Acc extends "" ? H : `${Acc}${Sep}${H}`>
	: Acc;

type TypeText<T> = Join<UnionList<T>, "|">;

type CellText<C> = C extends {
	readonly n: infer N extends string;
	readonly t: { readonly type: infer T; readonly nullable: infer Nl };
}
	? `${N}\u0002${TypeText<T>}\u0002${Nl extends true ? "1" : "0"}`
	: "?";

type CellsText<C extends readonly unknown[]> = Join<
	{ [I in keyof C]: CellText<C[I]> },
	"\u0001"
>;

type UseText<U> = U extends { readonly nullTest: true }
	? "?"
	: U extends { readonly type: infer T; readonly nullable: infer Nl }
		? `${TypeText<T>}${Nl extends true ? "?" : ""}`
		: "";
type ParamText<
	P,
	N extends number,
	I extends number = 1,
	Acc extends readonly string[] = [],
> = Acc["length"] extends N
	? Join<Acc, "\u0001">
	: ParamText<
			P,
			N,
			[...Acc, 0, 0]["length"] & number,
			[...Acc, I extends keyof P ? Join<UnionList<UseText<P[I]>>, ","> : ""]
		>;

export type View<DB, Q extends string> =
	Analysis<DB, Q> extends infer A
		? A extends SqlError<infer M extends string, infer At>
			? `E${M}\u0003${At extends number ? At : "-"}`
			: A extends AnyErr
				? "E?"
				: A extends {
							readonly cols: infer C;
							readonly params: infer P;
							readonly max: infer N extends number;
						}
					? `R${C extends readonly unknown[] ? CellsText<C> : ""}\u0003${ParamText<P, N>}`
					: "?"
		: never;

export type Schema<Q extends string> = ApplyDdl<{}, Q>;

export type SchemaView<Q extends string> =
	ApplyDdl<{}, Q> extends infer R
		? R extends SqlError<infer M extends string, unknown>
			? `E${M}`
			: "R"
		: never;
