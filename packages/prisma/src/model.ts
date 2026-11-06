// What the conversions read of Prisma Client's types, in every dialect.

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

export type ColumnName<F, O> = O extends {
	readonly column: infer C extends string;
}
	? C
	: F;

export type OverrideType<O, Default> = O extends string
	? O
	: O extends { readonly type: infer X extends string }
		? X
		: Default;

/**
 * The options of a field's `Col`: nullable when it is, else with a default
 * when it is optional in a create, unless its override says otherwise.
 */
export type ColumnFlags<
	Nullable extends boolean,
	Optional extends boolean,
	O,
> = (
	O extends { readonly nullable: infer N extends boolean }
		? N
		: Nullable
) extends infer N extends boolean
	? Flags<
			N,
			O extends { readonly default: infer D extends boolean }
				? D
				: N extends true
					? false
					: Optional
		>
	: never;

// One of four flag objects, so that columns of a type share one `Col`.
type Flags<N, H> = N extends true
	? H extends true
		? { nullable: true; hasDefault: true }
		: { nullable: true }
	: H extends true
		? { hasDefault: true }
		: Record<never, never>;

export type TableName<N, MO> = MO extends {
	readonly $table: infer T extends string;
}
	? T
	: N & string;
