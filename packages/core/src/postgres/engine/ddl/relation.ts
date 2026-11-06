import type { DelKey, RenameKey, SetKey } from "../../../engine/object.js";
import type { SqlError } from "../../../errors.js";
import type { TableRef } from "../ast.js";
import type { IsNamespace, IsViewVal, MetaKey } from "../db.js";

type IsTop<S> = S extends null | "public" ? true : false;

type Written<Ref extends TableRef> = Ref["schema"] extends string
	? `${Ref["schema"]}.${Ref["name"]}`
	: Ref["name"];

export type AlreadyExists<DB, Ine, What extends string> = Ine extends true
	? DB
	: SqlError<`${What} already exists`, null>;

type MissingRel<DB, Ref extends TableRef, E> =
	SchemaExists<DB, Ref["schema"]> extends false ? NoSchema<Ref["schema"]> : E;

export type NoRelation<DB, Ref extends TableRef> = MissingRel<
	DB,
	Ref,
	SqlError<`relation "${Written<Ref>}" does not exist`, null>
>;

export type IsSchemaKey<DB, K extends string> = K extends keyof DB
	? K extends MetaKey
		? false
		: [keyof DB[K]] extends [never]
			? true
			: IsNamespace<DB[K]>
	: false;

export type GetRel<DB, Ref extends TableRef> =
	IsTop<Ref["schema"]> extends true
		? Ref["name"] extends keyof DB
			? Ref["name"] extends MetaKey
				? null
				: IsNamespace<DB[Ref["name"]]> extends true
					? null
					: DB[Ref["name"]]
			: null
		: Ref["schema"] extends keyof DB
			? Ref["name"] extends keyof DB[Ref["schema"]]
				? DB[Ref["schema"]][Ref["name"]]
				: null
			: null;

export type SchemaExists<DB, S> =
	IsTop<S> extends true ? true : IsSchemaKey<DB, S & string>;

export type NoSchema<S> = SqlError<
	`schema "${S & string}" does not exist`,
	null
>;

export type SchemaClash<DB, Ref extends TableRef> =
	IsTop<Ref["schema"]> extends true
		? Ref["name"] extends keyof DB
			? SqlError<
					`cannot create relation "${Ref["name"]}": a schema with that name exists (TypeSQL keeps schemas and public relations in one object)`,
					null
				>
			: null
		: null;

export type CanCreate<DB, Ref extends TableRef> =
	SchemaExists<DB, Ref["schema"]> extends false
		? NoSchema<Ref["schema"]>
		: SchemaClash<DB, Ref>;

export type PutRel<DB, Ref extends TableRef, V> =
	IsTop<Ref["schema"]> extends true
		? SetKey<DB, Ref["name"], V>
		: Ref["schema"] extends keyof DB
			? SetKey<
					DB,
					Ref["schema"] & string,
					SetKey<DB[Ref["schema"]], Ref["name"], V>
				>
			: NoSchema<Ref["schema"]>;

export type DelRel<DB, Ref extends TableRef> =
	IsTop<Ref["schema"]> extends true
		? DelKey<DB, Ref["name"]>
		: Ref["schema"] extends keyof DB
			? SetKey<
					DB,
					Ref["schema"] & string,
					DelKey<DB[Ref["schema"]], Ref["name"]>
				>
			: DB;

export type RenameRel<DB, Ref extends TableRef, To extends string> =
	IsTop<Ref["schema"]> extends true
		? RenameKey<DB, Ref["name"], To>
		: Ref["schema"] extends keyof DB
			? SetKey<
					DB,
					Ref["schema"] & string,
					RenameKey<DB[Ref["schema"]], Ref["name"], To>
				>
			: DB;

export type ApplyDropRels<
	DB,
	Refs,
	Ife,
	Kind extends "table" | "view" | "materialized view",
> = Refs extends readonly [infer R extends TableRef, ...infer Rest]
	? GetRel<DB, R> extends infer Rel
		? Rel extends null
			? Ife extends true
				? ApplyDropRels<DB, Rest, Ife, Kind>
				: MissingRel<
						DB,
						R,
						SqlError<`${Kind} "${R["name"]}" does not exist`, null>
					>
			: (
						IsViewVal<Rel> extends true
							? Kind extends "table"
								? false
								: true
							: Kind extends "table"
								? true
								: false
					) extends true
				? ApplyDropRels<DelRel<DB, R>, Rest, Ife, Kind>
				: SqlError<`"${R["name"]}" is not a ${Kind}`, null>
		: never
	: DB;
