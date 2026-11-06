import type { Col, Typed } from "@typesql/core/mysql";
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

export type PrismaScalarToMysql = (typeof PRISMA_SCALARS)["mysql"];

// An enum field is an ENUM column of its values.
type MysqlOf<T extends string, V> = T extends keyof PrismaScalarToMysql
	? PrismaScalarToMysql[T]
	: Typed<"enum", Exclude<V, null>>;

export type MysqlColumns<
	M,
	MO,
	FS = Fields<M>,
	S = Scalars<M>,
	Null = NullableKeys<M>,
	Opt = OptionalCreateKeys<M>,
> = {
	-readonly [F in keyof FS as ColumnName<F, Get<MO, F>>]: Col<
		OverrideType<Get<MO, F>, MysqlOf<TypeName<FS[F]>, Get<S, F>>>,
		ColumnFlags<
			F extends Null ? true : false,
			F extends Opt ? true : false,
			Get<MO, F>
		>
	>;
};
