import type { Col } from "@typesql/core/postgres";
import type {
	ColumnFlags,
	ColumnName,
	Fields,
	Get,
	Models,
	NullableKeys,
	OptionalCreateKeys,
	OverrideType,
	PrismaTypeMapLike,
	Scalars,
	TypeName,
} from "./model.js";
import type { PRISMA_SCALARS } from "./scalars.js";

export type PrismaScalarToPg = (typeof PRISMA_SCALARS)["postgres"];

// An enum field's type is its enum's name.
type PgOf<T extends string> = T extends keyof PrismaScalarToPg
	? PrismaScalarToPg[T]
	: T;
type ElemName<T extends string> = T extends `${infer E}[]` ? E : T;
type IsList<T extends string> = T extends `${string}[]` ? true : false;

type ListOf<T extends string, E extends string> =
	IsList<T> extends true ? `${E}[]` : E;

export type PgColumns<
	M,
	MO,
	FS = Fields<M>,
	Null = NullableKeys<M>,
	Opt = OptionalCreateKeys<M>,
> = {
	-readonly [F in keyof FS as ColumnName<F, Get<MO, F>>]: Col<
		ListOf<
			TypeName<FS[F]>,
			OverrideType<Get<MO, F>, PgOf<ElemName<TypeName<FS[F]>>>>
		>,
		ColumnFlags<
			IsList<TypeName<FS[F]>> extends true
				? true
				: F extends Null
					? true
					: false,
			F extends Opt ? true : false,
			Get<MO, F>
		>
	>;
};

type EnumEntries<TM extends PrismaTypeMapLike> = {
	[N in keyof Models<TM>]: ModelEnums<
		Fields<Models<TM>[N]>,
		Scalars<Models<TM>[N]>
	>;
}[keyof Models<TM>];
type ModelEnums<FS, S> = {
	[F in keyof FS]: ElemName<TypeName<FS[F]>> extends infer E extends string
		? E extends keyof PrismaScalarToPg
			? never
			: {
					name: E;
					values: Exclude<Get<S, F>, null> extends infer V
						? V extends readonly (infer X)[]
							? X
							: V
						: never;
				}
		: never;
}[keyof FS];

/** The enums of a PostgreSQL schema, with the values `$types` overrides. */
export type Enums<TM extends PrismaTypeMapLike, O> = {
	-readonly [E in EnumEntries<TM> as E["name"]]: E["name"] extends keyof Get<
		O,
		"$types"
	>
		? Get<O, "$types">[E["name"]]
		: E["values"];
};
