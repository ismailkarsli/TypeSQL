import type { Col, Typed } from "@typesql/core/sqlite";
import type {
	ColumnFlags,
	ColumnName,
	Fields,
	Get,
	NullableKeys,
	OptionalCreateKeys,
	OverrideType,
	Scalars,
	TypeName,
} from "./model.js";
import type { PRISMA_SCALARS } from "./scalars.js";

export type PrismaScalarToSqlite = (typeof PRISMA_SCALARS)["sqlite"];

// SQLite has no enums: an enum field is text of its values.
type SqliteOf<T extends string, V> = T extends keyof PrismaScalarToSqlite
	? PrismaScalarToSqlite[T]
	: Typed<"text", Exclude<V, null>>;

export type SqliteColumns<
	M,
	MO,
	FS = Fields<M>,
	S = Scalars<M>,
	Null = NullableKeys<M>,
	Opt = OptionalCreateKeys<M>,
> = {
	-readonly [F in keyof FS as ColumnName<F, Get<MO, F>>]: Col<
		OverrideType<Get<MO, F>, SqliteOf<TypeName<FS[F]>, Get<S, F>>>,
		ColumnFlags<
			F extends Null ? true : false,
			F extends Opt ? true : false,
			Get<MO, F>
		>
	>;
};
