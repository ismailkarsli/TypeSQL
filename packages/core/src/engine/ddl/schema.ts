import type { TableRef } from "../ast.js";
import type { AnyErr, SqlError } from "../errors.js";
import type { ApplyCreateTable, ApplyTypedTable } from "./create-table.js";
import type { ApplyPatch, DelKey, RenameKey, SetKey } from "./object.js";
import type { IsSchemaKey } from "./relation.js";
import type { ApplyCreateView } from "./view.js";

export type ApplyCreateSchema<
	DB,
	Ine,
	Name extends string,
> = Name extends "public"
	? Ine extends true
		? DB
		: SqlError<`schema "public" already exists`, null>
	: Name extends keyof DB
		? IsSchemaKey<DB, Name> extends true
			? Ine extends true
				? DB
				: SqlError<`schema "${Name}" already exists`, null>
			: SqlError<
					`cannot create schema "${Name}": a relation with that name exists (TypeSQL keeps schemas and public relations in one object)`,
					null
				>
		: SetKey<DB, Name, {}>;

export type ApplyElements<DB, S extends string, Els> = Els extends readonly [
	infer E,
	...infer R,
]
	? ApplyElement<DB, S, E> extends infer DB2
		? DB2 extends AnyErr
			? DB2
			: ApplyElements<DB2, S, R>
		: never
	: DB;

type ApplyElement<DB, S extends string, E> = E extends {
	readonly t: "create_table";
	readonly ifNotExists: infer Ine;
	readonly table: infer Ref extends TableRef;
	readonly columns: infer Defs;
	readonly constraints: infer Cons;
	readonly like: infer Likes;
	readonly inherits: infer Inh;
	readonly of: infer Of;
}
	? Of extends TableRef
		? ApplyTypedTable<DB, Ine, Ref, Of>
		: ApplyCreateTable<
				DB,
				Ine,
				Ref,
				Defs,
				Cons,
				InSearchPath<DB, S, Likes>,
				InSearchPath<DB, S, Inh>
			>
	: E extends {
				readonly t: "create_view";
				readonly orReplace: infer OrR;
				readonly ifNotExists: infer Ine;
				readonly view: infer Ref extends TableRef;
				readonly cols: infer Names;
				readonly q: infer Q;
			}
		? ApplyCreateView<
				DB,
				OrR,
				Ine,
				Ref,
				Names,
				Q,
				S extends keyof DB ? ApplyPatch<DB, DB[S], never> : DB
			>
		: DB;

type InSearchPath<DB, S extends string, Items> = {
	[K in keyof Items]: Items[K] extends {
		readonly schema: null;
		readonly name: infer N;
	}
		? S extends keyof DB
			? N extends keyof DB[S]
				? { schema: S; name: N }
				: Items[K]
			: Items[K]
		: Items[K] extends {
					readonly ref: { readonly schema: null; readonly name: infer N };
					readonly defaults: infer D;
				}
			? S extends keyof DB
				? N extends keyof DB[S]
					? { ref: { schema: S; name: N }; defaults: D }
					: Items[K]
				: Items[K]
			: Items[K];
};

export type ApplyDropSchemas<DB, Names, Ife, Casc> = Names extends readonly [
	infer N extends string,
	...infer Rest,
]
	? N extends "public"
		? SqlError<"DROP SCHEMA public is not supported", null>
		: IsSchemaKey<DB, N> extends true
			? [keyof DB[N & keyof DB]] extends [never]
				? ApplyDropSchemas<DelKey<DB, N>, Rest, Ife, Casc>
				: Casc extends true
					? ApplyDropSchemas<DelKey<DB, N>, Rest, Ife, Casc>
					: SqlError<
							`cannot drop schema ${N} because other objects depend on it`,
							null
						>
			: Ife extends true
				? ApplyDropSchemas<DB, Rest, Ife, Casc>
				: SqlError<`schema "${N}" does not exist`, null>
	: DB;

export type ApplyRenameSchema<DB, F extends string, To extends string> =
	IsSchemaKey<DB, F> extends true
		? To extends keyof DB | "public"
			? SqlError<`schema "${To}" already exists`, null>
			: RenameKey<DB, F, To>
		: SqlError<`schema "${F}" does not exist`, null>;
