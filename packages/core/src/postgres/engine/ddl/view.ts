import type { PickOne } from "../../../engine/object.js";
import type { AnyErr, SqlError } from "../../../errors.js";
import type { TableRef } from "../ast.js";
import type { DisplayType, TypeConflict, TypeOfCol } from "./column.js";
import type { QueryCols, ViewTable } from "./query.js";
import type {
	AsView,
	CanCreate,
	ColsOf,
	GetRel,
	IsViewVal,
	PutRel,
} from "./relation.js";

export type ApplyCreateView<
	DB,
	OrR,
	Ine,
	Ref extends TableRef,
	Names,
	Q,
	QDB = DB,
> =
	GetRel<DB, Ref> extends infer Rel
		? Rel extends null
			? CanCreate<DB, Ref> extends infer E
				? E extends AnyErr
					? E
					: BuildView<DB, Ref, Names, Q, null, QDB>
				: never
			: Ine extends true
				? DB
				: OrR extends true
					? IsViewVal<Rel> extends true
						? BuildView<DB, Ref, Names, Q, ColsOf<Rel>, QDB>
						: SqlError<`"${Ref["name"]}" is not a view`, null>
					: SqlError<`relation "${Ref["name"]}" already exists`, null>
		: never;

type BuildView<DB, Ref extends TableRef, Names, Q, Old, QDB = DB> =
	QueryCols<
		QDB,
		Q,
		Names,
		"CREATE VIEW specifies more column names than columns"
	> extends infer M
		? M extends AnyErr
			? M
			: ViewTable<M> extends infer V
				? ReplaceCheck<Old, V> extends infer E
					? E extends AnyErr
						? E
						: PutRel<DB, Ref, AsView<V>>
					: never
				: never
		: never;

type ReplaceCheck<Old, V> = Old extends null ? null : CheckReplace<Old, V>;

type CheckReplace<Old, New> = [Exclude<keyof Old, keyof New>] extends [never]
	? PickOne<TypeConflict<Old, New>> extends infer K
		? [K] extends [never]
			? null
			: K extends keyof Old & keyof New
				? SqlError<
						`cannot change data type of view column "${K & string}" from ${DisplayType<TypeOfCol<Old[K]>>} to ${DisplayType<TypeOfCol<New[K]>>}`,
						null
					>
				: null
		: never
	: SqlError<"cannot drop columns from view", null>;
