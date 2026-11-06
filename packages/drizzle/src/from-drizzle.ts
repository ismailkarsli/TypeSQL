import type { FromDrizzleOptions } from "./column.js";
import type { MysqlColumns, MysqlViewColumns } from "./from-drizzle-mysql.js";
import type { Enums, PgColumns, PgViewColumns } from "./from-drizzle-pg.js";
import type {
	SqliteColumns,
	SqliteViewColumns,
} from "./from-drizzle-sqlite.js";

export type FromDrizzle<
	Schema,
	Opts extends FromDrizzleOptions = {},
> = FromDrizzleOf<Schema, Opts, "postgres">;

export type FromDrizzleMysql<
	Schema,
	Opts extends FromDrizzleOptions = {},
> = FromDrizzleOf<Schema, Opts, "mysql">;

export type FromDrizzleSqlite<
	Schema,
	Opts extends FromDrizzleOptions = {},
> = FromDrizzleOf<Schema, Opts, "sqlite">;

type Dialect = "postgres" | "mysql" | "sqlite";

type TableLike = {
	readonly _: {
		readonly brand: "Table";
		readonly name: string;
		readonly schema: string | undefined;
		readonly columns: object;
	};
};
type ViewLike = {
	readonly _: {
		readonly brand: "View";
		readonly name: string;
		readonly selectedFields: object;
	};
};

// Each dialect's columns are a mapped type of their own: one whose column
// type depends on the dialect costs more to check.
type Columns<C, Opts, D extends Dialect, E> = D extends "mysql"
	? MysqlColumns<C, Opts>
	: D extends "sqlite"
		? SqliteColumns<C, Opts>
		: PgColumns<C, Opts, E>;

type ViewColumns<F, Opts, D extends Dialect, E> = D extends "mysql"
	? MysqlViewColumns<F, Opts>
	: D extends "sqlite"
		? SqliteViewColumns<F, Opts>
		: PgViewColumns<F, Opts, E>;

type Relation<X, Opts, D extends Dialect, E> = X extends TableLike
	? Columns<X["_"]["columns"], Opts, D, E>
	: X extends ViewLike
		? { readonly $view: ViewColumns<X["_"]["selectedFields"], Opts, D, E> }
		: never;

// PostgreSQL leaves out the `public` schema. Tables of a `mysqlSchema()` live
// in another database, `db.table`: MySQL has no default schema to leave out.
// SQLite tables have no schema.
type DefaultSchema<D extends Dialect> = D extends "postgres" ? "public" : never;

/**
 * The schema of a table that isn't in the default one: its relations are a
 * namespace's, `db.schema.table`.
 */
type SchemaOf<X, Default> = X extends TableLike
	? Exclude<X["_"]["schema"], undefined | Default>
	: never;
type NameIn<X, N> = X extends TableLike
	? X["_"]["schema"] extends N
		? X["_"]["name"]
		: never
	: never;
/** The name of a relation outside every namespace. */
type TopName<X, Default> = X extends TableLike
	? [SchemaOf<X, Default>] extends [never]
		? X["_"]["name"]
		: never
	: X extends ViewLike
		? X["_"]["name"]
		: never;

type Build<S, Opts, D extends Dialect, E> = {
	-readonly [K in keyof S as TopName<S[K], DefaultSchema<D>>]: Relation<
		S[K],
		Opts,
		D,
		E
	>;
} & {
	[N in { [K in keyof S]: SchemaOf<S[K], DefaultSchema<D>> }[keyof S]]: {
		-readonly [K in keyof S as NameIn<S[K], N>]: Relation<S[K], Opts, D, E>;
	};
} & (keyof E extends never ? {} : { $types: E });

type Flat<T> = { [K in keyof T]: T[K] } & {};

type BuildOf<S, Opts, D extends Dialect> = Flat<
	Build<S, Opts, D, D extends "postgres" ? Enums<S> : Record<never, never>>
>;

/** The schema of a Drizzle schema module, or of one table or view, in dialect `D`. */
type FromDrizzleOf<
	Schema,
	Opts extends FromDrizzleOptions,
	D extends Dialect,
> = Schema extends TableLike | ViewLike
	? BuildOf<{ [K in Schema["_"]["name"]]: Schema }, Opts, D>
	: BuildOf<Schema, Opts, D>;
