// The schema after a migration, as types read it. It names no dialect, so
// the root entry, which exports SchemaOf, loads no dialect's engine.

declare const MISSING_SCHEMA: unique symbol;
/** The schema of a migration whose `up` doesn't return its context. */
export type MissingSchema = { readonly [MISSING_SCHEMA]: true };

/** The schema of a migration context: its `schema`. */
type ContextSchema<C> = C extends { readonly schema: infer Schema }
	? Schema
	: MissingSchema;

/** Type-only: the schema a migrator or its `latest()` result leaves. */
export declare const SCHEMA: unique symbol;

/**
 * The schema after a migration: `SchemaOf<typeof m>`. It also takes a
 * migrator or its `latest()` result (the schema after the last migration),
 * a 3.x migration's `up` function, or a migration context.
 */
export type SchemaOf<M> = M extends { readonly [SCHEMA]: infer Schema }
	? Schema
	: M extends { readonly up: (db: never) => Promise<infer After> }
		? ContextSchema<After>
		: M extends (db: never) => Promise<infer After>
			? ContextSchema<After>
			: ContextSchema<M>;
