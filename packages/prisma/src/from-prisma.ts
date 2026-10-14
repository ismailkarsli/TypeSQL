/**
 * Type-level conversion of a generated Prisma Client (`Prisma.TypeMap`) into a typesql schema.
 *
 * Everything is read from the generated types: field types from `<Model>FieldRefs`
 * (`FieldRef<"User", "Int">`), nullability from `<Model>OrderByWithRelationInput`, "has a
 * default" from optionality in `<Model>CreateManyInput`, and enum values from the scalars payload. Database names (`@map`/`@@map`), native types
 * (`@db.*`) and `@@schema` are not visible in those types; supply them as overrides, or use
 * the `typesql-prisma` generator, which reads Prisma's DMMF and is exact.
 */

/** Prisma scalar type → Postgres type Prisma's PostgreSQL connector uses when no `@db.*` attribute is given. */
export interface PrismaScalarToPg {
  Int: "int4";
  BigInt: "int8";
  Float: "float8";
  Decimal: "numeric";
  String: "text";
  Boolean: "bool";
  /** `timestamp(3)`, without time zone. */
  DateTime: "timestamp";
  Json: "jsonb";
  Bytes: "bytea";
}

/** The part of a generated `Prisma.TypeMap` the converter reads. */
export interface PrismaTypeMapLike {
  readonly model: {
    readonly [model: string]: {
      readonly payload: { readonly scalars: object };
      readonly fields: object;
      readonly operations: object;
    };
  };
}

/**
 * Override for one field: a Postgres type name (shorthand for `{ type }`), or an object.
 * For list fields `type` is the element type (`"varchar"` → `varchar[]`).
 */
export type FieldOverride =
  | string
  | {
      /** Database column name (`@map`). */
      readonly column?: string;
      /** Postgres type name (`@db.*`), e.g. `"varchar"`, `"timestamptz"`, `"uuid"`. */
      readonly type?: string;
      readonly nullable?: boolean;
      /** Whether the column has a database default (optional on INSERT). */
      readonly default?: boolean;
    };

/** Override for one model: `$table` (`@@map`), `$schema` (`@@schema`) and per-field overrides. */
export type ModelOverride<Fields = {}> = {
  /** Database table name (`@@map`). */
  readonly $table?: string;
  /** Postgres schema (`@@schema`). Anything but `"public"` nests the table under `DB[schema]`. */
  readonly $schema?: string;
} & { readonly [F in keyof Fields]?: FieldOverride };

/** Maps keys of `O` outside `Allowed` to `never` (type arguments get no excess-property check). */
type KnownKeys<O, Allowed> = { readonly [K in Exclude<keyof O, Allowed>]: never };

/**
 * Overrides for `FromPrisma`, keyed by model name. `$types` replaces enum value unions
 * (for `@map`ped enum values), keyed by Prisma enum name. Pass the overrides as `O` to have
 * unknown model and field names rejected.
 */
export type PrismaOverrides<TM extends PrismaTypeMapLike = PrismaTypeMapLike, O = {}> = {
  readonly [M in keyof TM["model"]]?: ModelOverride<TM["model"][M]["fields"]> & KnownKeys<Get<O, M>, keyof TM["model"][M]["fields"] | "$table" | "$schema">;
} & { readonly $types?: { readonly [name: string]: string } } & KnownKeys<O, keyof TM["model"] | "$types">;

type Models<TM extends PrismaTypeMapLike> = TM["model"];
type Scalars<M> = M extends { payload: { scalars: infer S } } ? S : never;
type Fields<M> = M extends { fields: infer F } ? F : never;
type TypeName<R> = R extends { readonly typeName: infer T extends string } ? T : never;
type Get<O, K> = K extends keyof O ? O[K] : undefined;

/** Keys that are optional in the model's `CreateManyInput` (scalars only, foreign keys included). */
type OptionalCreateKeys<M> =
  M extends { operations: { createMany: { args: { data: infer D } } } }
    ? Exclude<D, readonly unknown[]> extends infer I ? { [K in keyof I]-?: {} extends Pick<I, K> ? K : never }[keyof I] : never
    : never;

/**
 * Nullable fields: those whose `orderBy` accepts `{ sort, nulls }` (`SortOrderInput`). The scalars
 * payload cannot tell, as a required `Json` field's type (`JsonValue`) already includes `null`.
 */
type NullableKeys<M> =
  M extends { operations: { findMany: { args: { orderBy?: infer O } } } }
    ? Exclude<O, readonly unknown[] | undefined> extends infer I ? { [K in keyof I]-?: { sort: "asc" } extends I[K] ? K : never }[keyof I] : never
    : never;

type PgOf<T extends string> = T extends keyof PrismaScalarToPg ? PrismaScalarToPg[T] : T;
type ElemName<T extends string> = T extends `${infer E}[]` ? E : T;
type IsList<T extends string> = T extends `${string}[]` ? true : false;

type ColumnName<F, O> = O extends { readonly column: infer C extends string } ? C : F;
type ColumnType<T extends string, O> =
  O extends string ? (IsList<T> extends true ? `${O}[]` : O)
  : O extends { readonly type: infer X extends string } ? (IsList<T> extends true ? `${X}[]` : X)
  : IsList<T> extends true ? `${PgOf<ElemName<T>>}[]` : PgOf<T>;

/** Defaults only count on NOT NULL columns, where they decide whether INSERT may omit the column. */
type Column<T extends string, Nullable extends boolean, Optional extends boolean, O> =
  (O extends { readonly nullable: infer N extends boolean } ? N : Nullable) extends infer N extends boolean
    ? {
        readonly type: ColumnType<T, O>;
        readonly nullable: N;
        readonly hasDefault: O extends { readonly default: infer D extends boolean } ? D : N extends true ? false : Optional;
      }
    : never;

/** Scalar lists are nullable: Prisma creates them without NOT NULL. */
type ModelColumns<M, MO, FS = Fields<M>, Null = NullableKeys<M>, Opt = OptionalCreateKeys<M>> = {
  -readonly [F in keyof FS as ColumnName<F, Get<MO, F>>]: Column<
    TypeName<FS[F]>,
    IsList<TypeName<FS[F]>> extends true ? true : F extends Null ? true : false,
    F extends Opt ? true : false,
    Get<MO, F>
  >;
};

/** Views have no create operations; they become `View<...>` (read-only). */
type TableOf<M, MO> =
  M extends { operations: { createMany: unknown } } ? ModelColumns<M, MO> : { readonly $view: ModelColumns<M, MO> };

type TableName<N, MO> = MO extends { readonly $table: infer T extends string } ? T : N & string;
type SchemaName<MO> = MO extends { readonly $schema: infer S extends string } ? (S extends "public" ? never : S) : never;

type TopLevel<TM extends PrismaTypeMapLike, O> = {
  -readonly [N in keyof Models<TM> as [SchemaName<Get<O, N>>] extends [never] ? TableName<N, Get<O, N>> : never]: TableOf<Models<TM>[N], Get<O, N>>;
};
type Namespaced<TM extends PrismaTypeMapLike, O> = {
  -readonly [S in { [N in keyof Models<TM>]: SchemaName<Get<O, N>> }[keyof Models<TM>]]: {
    -readonly [N in keyof Models<TM> as SchemaName<Get<O, N>> extends S ? TableName<N, Get<O, N>> : never]: TableOf<Models<TM>[N], Get<O, N>>;
  };
};

/** `{ name, values }` for each enum-typed field (Prisma type names that are not scalars). */
type EnumEntries<TM extends PrismaTypeMapLike> = {
  [N in keyof Models<TM>]: ModelEnums<Fields<Models<TM>[N]>, Scalars<Models<TM>[N]>>;
}[keyof Models<TM>];
type ModelEnums<FS, S> = {
  [F in keyof FS]: ElemName<TypeName<FS[F]>> extends infer E extends string
    ? E extends keyof PrismaScalarToPg ? never : { name: E; values: Exclude<Get<S, F>, null> extends infer V ? (V extends readonly (infer X)[] ? X : V) : never }
    : never;
}[keyof FS];
type Enums<TM extends PrismaTypeMapLike, O> = {
  -readonly [E in EnumEntries<TM> as E["name"]]: E["name"] extends keyof Get<O, "$types"> ? Get<O, "$types">[E["name"]] : E["values"];
};

/**
 * A typesql schema from a generated Prisma Client: `FromPrisma<Prisma.TypeMap>`.
 *
 *   Tables are keyed by model name and columns by field name (relation fields are skipped);
 *   types follow Prisma's PostgreSQL defaults (`PrismaScalarToPg`); enums go to `$types`.
 *   `Overrides` renames tables/columns and pins native types:
 *
 *   FromPrisma<Prisma.TypeMap, {
 *     User: { $table: "users"; name: { column: "display_name" }; email: "varchar" };
 *   }>
 */
export type FromPrisma<TM extends PrismaTypeMapLike, Overrides extends PrismaOverrides<TM, Overrides> = {}> =
  TopLevel<TM, Overrides> & Namespaced<TM, Overrides> & { $types: Enums<TM, Overrides> } extends infer DB
    ? { [K in keyof DB]: DB[K] }
    : never;
