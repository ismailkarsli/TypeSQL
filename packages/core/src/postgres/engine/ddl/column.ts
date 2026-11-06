import type { Col } from "../../../schema.js";
import type { ColumnDef } from "../ast.js";

export type MkCol<Ty extends string, N, H> = N extends true
	? H extends true
		? Col<Ty, { nullable: true; hasDefault: true }>
		: Col<Ty, { nullable: true }>
	: H extends true
		? Col<Ty, { hasDefault: true }>
		: Col<Ty>;

export type DescOf<D extends ColumnDef> = MkCol<
	D["type"],
	D["notNull"] extends true ? false : true,
	D["hasDefault"]
>;

export type TypeOfCol<C> = C extends { readonly type: infer Ty extends string }
	? Ty
	: never;

export type NullOf<C> = C extends { readonly nullable: infer N } ? N : true;

export type DefOf<C> = C extends { readonly hasDefault: infer H } ? H : false;

export type WithNullable<C, N> = MkCol<TypeOfCol<C>, N, DefOf<C>>;

export type WithDefault<C, H> = MkCol<TypeOfCol<C>, NullOf<C>, H>;

export type WithType<C, Ty extends string> = MkCol<Ty, NullOf<C>, DefOf<C>>;

export type TypeConflict<A, B> = {
	[K in keyof A & keyof B]: TypeOfCol<A[K]> extends TypeOfCol<B[K]>
		? TypeOfCol<B[K]> extends TypeOfCol<A[K]>
			? never
			: K
		: K;
}[keyof A & keyof B];

export type FirstMissing<Cs, Tbl> = Cs extends readonly [infer C, ...infer R]
	? C extends keyof Tbl
		? FirstMissing<R, Tbl>
		: C
	: null;
