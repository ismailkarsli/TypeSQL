import type { ColumnDef, LikeClause, TableRef } from "../ast.js";
import type { AnyErr, SqlError } from "../errors.js";
import type {
	DefOf,
	DescOf,
	FirstMissing,
	MkCol,
	NullOf,
	TypeConflict,
	TypeOfCol,
	WithDefault,
	WithNullable,
} from "./column.js";
import type { PickOne, Rebuild } from "./object.js";
import type { QueryCols, StoredType } from "./query.js";
import type {
	CanCreate,
	ColsOf,
	GetRel,
	IsViewVal,
	MissingRel,
	PutRel,
	Written,
} from "./relation.js";

export type ApplyTypedTable<
	DB,
	Ine,
	Ref extends TableRef,
	Of extends TableRef,
> =
	GetRel<DB, Ref> extends null
		? SqlError<
				`typed table "${Ref["name"]}" (CREATE TABLE ... OF ${Of["name"]}) is not supported: TypeSQL does not track the columns of composite types; list the columns`,
				null
			>
		: Ine extends true
			? DB
			: SqlError<`relation "${Ref["name"]}" already exists`, null>;

export type ApplyCreateTable<
	DB,
	Ine,
	Ref extends TableRef,
	Defs,
	Cons,
	Likes,
	Inh,
> =
	GetRel<DB, Ref> extends null
		? CanCreate<DB, Ref> extends infer E
			? E extends AnyErr
				? E
				: BuildTable<DB, Ref["name"], Defs, Cons, Likes, Inh> extends infer Tbl
					? Tbl extends AnyErr
						? Tbl
						: PutRel<DB, Ref, Tbl>
					: never
			: never
		: Ine extends true
			? DB
			: SqlError<`relation "${Ref["name"]}" already exists`, null>;

type BuildTable<DB, TN extends string, Defs, Cons, Likes, Inh> =
	AddInherits<Inh, DB, {}> extends infer A0
		? A0 extends AnyErr
			? A0
			: AddLikes<Likes, DB, A0, never> extends infer A1
				? A1 extends readonly [infer Acc1, infer Seen1]
					? AddDefs<Defs, Acc1, keyof A0, Seen1> extends infer A2
						? A2 extends AnyErr
							? A2
							: PrimaryKey<Defs, Cons, A2, TN> extends infer Pk
								? Pk extends readonly [infer P]
									? ConNotNulls<Cons> extends infer NN
										? [Exclude<NN, keyof A2>] extends [never]
											? Rebuild<{
													[K in keyof A2]: K extends P | NN
														? WithNullable<A2[K], false>
														: A2[K];
												}>
											: SqlError<
													`column "${PickOne<Exclude<NN, keyof A2>> & string}" of relation "${TN}" does not exist`,
													null
												>
										: never
									: Pk
								: never
						: never
					: A1
				: never
		: never;

type AddInherits<Ps, DB, Acc> = Ps extends readonly [
	infer P extends TableRef,
	...infer R,
]
	? GetRel<DB, P> extends infer Rel
		? Rel extends null
			? MissingRel<
					DB,
					P,
					SqlError<`relation "${Written<P>}" does not exist`, null>
				>
			: IsViewVal<Rel> extends true
				? SqlError<
						`inherited relation "${P["name"]}" is not a table or foreign table`,
						null
					>
				: TypeConflict<Acc, Rel> extends infer K
					? [K] extends [never]
						? AddInherits<R, DB, MergeCols<Acc, Rel>>
						: SqlError<
								`inherited column "${PickOne<K> & string}" has a type conflict`,
								null
							>
					: never
		: never
	: Acc;

type MergeCol<A, B> = MkCol<
	TypeOfCol<A>,
	NullOf<A> extends true ? NullOf<B> : false,
	DefOf<A> extends true ? true : DefOf<B>
>;

type MergeCols<A, B> = Rebuild<
	{ [K in keyof A]: K extends keyof B ? MergeCol<A[K], B[K]> : A[K] } & {
		[K in Exclude<keyof B, keyof A>]: B[K];
	}
>;

type AddLikes<Ls, DB, Acc, Seen> = Ls extends readonly [
	infer L extends LikeClause,
	...infer R,
]
	? GetRel<DB, L["ref"]> extends infer Rel
		? Rel extends null
			? MissingRel<
					DB,
					L["ref"],
					SqlError<`relation "${Written<L["ref"]>}" does not exist`, null>
				>
			: CopyCols<ColsOf<Rel>, L["defaults"]> extends infer C
				? [keyof C & keyof Acc] extends [never]
					? AddLikes<R, DB, Acc & C, Seen | keyof C>
					: SqlError<
							`column "${PickOne<keyof C & keyof Acc> & string}" specified more than once`,
							null
						>
				: never
		: never
	: [Acc, Seen];

type CopyCols<Tbl, Defaults> = {
	[K in keyof Tbl]: Defaults extends true ? Tbl[K] : WithDefault<Tbl[K], false>;
};

type AddDefs<Defs, Acc, Inh, Seen> = Defs extends readonly [
	infer D extends ColumnDef,
	...infer R,
]
	? D["name"] extends Seen
		? SqlError<`column "${D["name"]}" specified more than once`, null>
		: D["name"] extends Inh
			? D["name"] extends keyof Acc
				? TypeOfCol<Acc[D["name"]]> extends D["type"]
					? AddDefs<
							R,
							Rebuild<{
								[K in keyof Acc]: K extends D["name"]
									? MergeCol<DescOf<D>, Acc[K]>
									: Acc[K];
							}>,
							Inh,
							Seen | D["name"]
						>
					: SqlError<`column "${D["name"]}" has a type conflict`, null>
				: never
			: AddDefs<R, Acc & { [P in D["name"]]: DescOf<D> }, Inh, Seen | D["name"]>
	: Acc;

type PrimaryKey<Defs, Cons, Acc, TN extends string> =
	ConPks<Cons, ColPks<Defs, []>> extends infer L
		? L extends readonly [unknown, unknown, ...unknown[]]
			? SqlError<
					`multiple primary keys for table "${TN}" are not allowed`,
					null
				>
			: L extends readonly [infer P extends readonly string[]]
				? FirstMissing<P, Acc> extends infer M extends string
					? SqlError<`column "${M}" named in key does not exist`, null>
					: [P[number]]
				: [never]
		: never;

type ColPks<Defs, Acc extends readonly unknown[]> = Defs extends readonly [
	infer D,
	...infer R,
]
	? ColPks<
			R,
			D extends { readonly primaryKey: true; readonly name: infer N }
				? [...Acc, [N]]
				: Acc
		>
	: Acc;

type ConPks<Cons, Acc extends readonly unknown[]> = Cons extends readonly [
	infer C,
	...infer R,
]
	? ConPks<
			R,
			C extends { readonly t: "pk"; readonly cols: infer Cs }
				? [...Acc, Cs]
				: Acc
		>
	: Acc;

type ConNotNulls<Cons> = Cons extends readonly (infer C)[]
	? C extends { readonly t: "not_null"; readonly col: infer N }
		? N
		: never
	: never;

export type ApplyCreateTableAs<DB, Ine, Ref extends TableRef, Names, Q> =
	GetRel<DB, Ref> extends null
		? CanCreate<DB, Ref> extends infer E
			? E extends AnyErr
				? E
				: QueryCols<
							DB,
							Q,
							Names,
							"too many column names were specified"
						> extends infer M
					? M extends AnyErr
						? M
						: PutRel<DB, Ref, CtasTable<M>>
					: never
			: never
		: Ine extends true
			? DB
			: SqlError<`relation "${Ref["name"]}" already exists`, null>;

type CtasTable<M> = Rebuild<{
	[K in keyof M]: MkCol<StoredType<M[K]>, true, false>;
}>;
