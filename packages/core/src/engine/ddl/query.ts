import type { SelectStmt } from "../ast.js";
import type { SqlError } from "../errors.js";
import type { ProjectSelect } from "../project/select.js";
import type { ColInfo, Cols, ColsToMap } from "../types.js";
import type { MkCol, NullOf, TypeOfCol } from "./column.js";
import type { PickOne, Rebuild } from "./object.js";

type QueryProjection<DB, Q> = Q extends SelectStmt
	? ProjectSelect<Q, DB, [], {}>
	: Q extends { readonly t: "execute"; readonly name: infer N extends string }
		? SqlError<
				`CREATE TABLE ... AS EXECUTE ${N} is not supported: the columns of a prepared statement are unknown`,
				null
			>
		: SqlError<"unsupported query", null>;

export type QueryCols<DB, Q, Names, TooMany extends string> =
	QueryProjection<DB, Q> extends infer C
		? C extends Cols
			? NameCols<C, Names, [], TooMany> extends infer C2
				? C2 extends Cols
					? DupCol<C2, never> extends infer Dup
						? Dup extends string
							? SqlError<`column "${Dup}" specified more than once`, null>
							: ColsToMap<C2>
						: never
					: C2
				: never
			: C
		: never;

type NameCols<
	C extends Cols,
	Names,
	Acc extends Cols,
	TooMany extends string,
> = Names extends readonly [infer N extends string, ...infer NR]
	? C extends readonly [infer H, ...infer R extends Cols]
		? H extends { readonly n: string; readonly t: infer I extends ColInfo }
			? NameCols<R, NR, [...Acc, { readonly n: N; readonly t: I }], TooMany>
			: SqlError<
					"a column name list cannot rename the columns of a * projection (TypeSQL limitation): list the columns explicitly",
					null
				>
		: SqlError<TooMany, null>
	: [...Acc, ...C];

type DupCol<C extends Cols, Seen> = C extends readonly [
	infer H,
	...infer R extends Cols,
]
	? H extends { readonly star: infer M }
		? [keyof M & Seen] extends [never]
			? DupCol<R, Seen | keyof M>
			: PickOne<keyof M & Seen>
		: H extends { readonly n: infer N }
			? [N] extends [Seen]
				? N
				: DupCol<R, Seen | N>
			: null
	: null;

export type ViewTable<M> = Rebuild<{
	[K in keyof M]: MkCol<StoredType<M[K]>, NullOf<M[K]>, false>;
}>;

export type StoredType<C> = TypeOfCol<C> extends "null" ? "text" : TypeOfCol<C>;
