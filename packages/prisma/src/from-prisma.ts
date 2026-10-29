export interface PrismaScalarToPg {
	Int: "int4";
	BigInt: "int8";
	Float: "float8";
	Decimal: "numeric";
	String: "text";
	Boolean: "bool";
	DateTime: "timestamp";
	Json: "jsonb";
	Bytes: "bytea";
}

export interface PrismaTypeMapLike {
	readonly model: {
		readonly [model: string]: {
			readonly payload: { readonly scalars: object };
			readonly fields: object;
			readonly operations: object;
		};
	};
}

export type FieldOverride =
	| string
	| {
			readonly column?: string;
			readonly type?: string;
			readonly nullable?: boolean;
			readonly default?: boolean;
	  };

export type ModelOverride<Fields = {}> = {
	readonly $table?: string;
	readonly $schema?: string;
} & { readonly [F in keyof Fields]?: FieldOverride };

type KnownKeys<O, Allowed> = {
	readonly [K in Exclude<keyof O, Allowed>]: never;
};

export type PrismaOverrides<
	TM extends PrismaTypeMapLike = PrismaTypeMapLike,
	O = {},
> = {
	readonly [M in keyof TM["model"]]?: ModelOverride<TM["model"][M]["fields"]> &
		KnownKeys<Get<O, M>, keyof TM["model"][M]["fields"] | "$table" | "$schema">;
} & { readonly $types?: { readonly [name: string]: string } } & KnownKeys<
		O,
		keyof TM["model"] | "$types"
	>;

export type Models<TM extends PrismaTypeMapLike> = TM["model"];
export type Scalars<M> = M extends { payload: { scalars: infer S } }
	? S
	: never;
export type Fields<M> = M extends { fields: infer F } ? F : never;
export type TypeName<R> = R extends {
	readonly typeName: infer T extends string;
}
	? T
	: never;
export type Get<O, K> = K extends keyof O ? O[K] : undefined;

export type OptionalCreateKeys<M> = M extends {
	operations: { createMany: { args: { data: infer D } } };
}
	? Exclude<D, readonly unknown[]> extends infer I
		? { [K in keyof I]-?: {} extends Pick<I, K> ? K : never }[keyof I]
		: never
	: never;

export type NullableKeys<M> = M extends {
	operations: { findMany: { args: { orderBy?: infer O } } };
}
	? Exclude<O, readonly unknown[] | undefined> extends infer I
		? { [K in keyof I]-?: { sort: "asc" } extends I[K] ? K : never }[keyof I]
		: never
	: never;

type PgOf<T extends string> = T extends keyof PrismaScalarToPg
	? PrismaScalarToPg[T]
	: T;
type ElemName<T extends string> = T extends `${infer E}[]` ? E : T;
type IsList<T extends string> = T extends `${string}[]` ? true : false;

export type ColumnName<F, O> = O extends {
	readonly column: infer C extends string;
}
	? C
	: F;
type ColumnType<T extends string, O> = O extends string
	? IsList<T> extends true
		? `${O}[]`
		: O
	: O extends { readonly type: infer X extends string }
		? IsList<T> extends true
			? `${X}[]`
			: X
		: IsList<T> extends true
			? `${PgOf<ElemName<T>>}[]`
			: PgOf<T>;

type Column<
	T extends string,
	Nullable extends boolean,
	Optional extends boolean,
	O,
> = (
	O extends { readonly nullable: infer N extends boolean }
		? N
		: Nullable
) extends infer N extends boolean
	? {
			readonly type: ColumnType<T, O>;
			readonly nullable: N;
			readonly hasDefault: O extends {
				readonly default: infer D extends boolean;
			}
				? D
				: N extends true
					? false
					: Optional;
		}
	: never;

type ModelColumns<
	M,
	MO,
	FS = Fields<M>,
	Null = NullableKeys<M>,
	Opt = OptionalCreateKeys<M>,
> = {
	-readonly [F in keyof FS as ColumnName<F, Get<MO, F>>]: Column<
		TypeName<FS[F]>,
		IsList<TypeName<FS[F]>> extends true ? true : F extends Null ? true : false,
		F extends Opt ? true : false,
		Get<MO, F>
	>;
};

type TableOf<M, MO> = M extends { operations: { createMany: unknown } }
	? ModelColumns<M, MO>
	: { readonly $view: ModelColumns<M, MO> };

export type TableName<N, MO> = MO extends {
	readonly $table: infer T extends string;
}
	? T
	: N & string;
type SchemaName<MO> = MO extends { readonly $schema: infer S extends string }
	? S extends "public"
		? never
		: S
	: never;

type TopLevel<TM extends PrismaTypeMapLike, O> = {
	-readonly [N in keyof Models<TM> as [SchemaName<Get<O, N>>] extends [never]
		? TableName<N, Get<O, N>>
		: never]: TableOf<Models<TM>[N], Get<O, N>>;
};
type Namespaced<TM extends PrismaTypeMapLike, O> = {
	-readonly [S in {
		[N in keyof Models<TM>]: SchemaName<Get<O, N>>;
	}[keyof Models<TM>]]: {
		-readonly [N in keyof Models<TM> as SchemaName<Get<O, N>> extends S
			? TableName<N, Get<O, N>>
			: never]: TableOf<Models<TM>[N], Get<O, N>>;
	};
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
type Enums<TM extends PrismaTypeMapLike, O> = {
	-readonly [E in EnumEntries<TM> as E["name"]]: E["name"] extends keyof Get<
		O,
		"$types"
	>
		? Get<O, "$types">[E["name"]]
		: E["values"];
};

export type FromPrisma<
	TM extends PrismaTypeMapLike,
	Overrides extends PrismaOverrides<TM, Overrides> = {},
> = TopLevel<TM, Overrides> &
	Namespaced<TM, Overrides> & { $types: Enums<TM, Overrides> } extends infer DB
	? { [K in keyof DB]: DB[K] }
	: never;
