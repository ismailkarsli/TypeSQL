import type { AnyErr, SqlError } from "../../../errors.js";
import type { ColumnDef, TableRef } from "../ast.js";
import type {
	DescOf,
	FirstMissing,
	NullOf,
	WithDefault,
	WithNullable,
	WithType,
} from "./column.js";
import type { DelKey, Rebuild, RenameKey, SetKey } from "./object.js";
import type {
	ColsOf,
	DelRel,
	GetRel,
	IsViewVal,
	MissingRel,
	NoSchema,
	PutRel,
	RenameRel,
	Rewrap,
	SchemaClash,
	SchemaExists,
	Written,
} from "./relation.js";

export type ApplyAlterTable<DB, Ife, Ref extends TableRef, As> =
	GetRel<DB, Ref> extends infer Rel
		? Rel extends null
			? Ife extends true
				? DB
				: MissingRel<
						DB,
						Ref,
						SqlError<`relation "${Written<Ref>}" does not exist`, null>
					>
			: As extends readonly [
						{
							readonly t: "rename_table";
							readonly to: infer To extends string;
						},
					]
				? RenameTable<DB, Ref, To>
				: As extends readonly [
							{
								readonly t: "set_schema";
								readonly schema: infer S extends string;
							},
						]
					? SetSchema<DB, Ref, S, Rel>
					: As extends readonly [
								{
									readonly t: "rename_column";
									readonly from: infer F extends string;
									readonly to: infer To extends string;
								},
							]
						? RenameColumn<DB, Ref, Rel, F, To>
						: (
									IsViewVal<Rel> extends true
										? ViewActionError<As, Ref["name"]>
										: null
								) extends infer VE
							? VE extends AnyErr
								? VE
								: RunPasses<ColsOf<Rel>, As, Ref["name"]> extends infer T2
									? T2 extends AnyErr
										? T2
										: PutRel<DB, Ref, Rewrap<Rel, T2>>
									: never
							: never
		: never;

type RenameTable<DB, Ref extends TableRef, To extends string> =
	GetRel<DB, { schema: Ref["schema"]; name: To }> extends null
		? SchemaClash<DB, { schema: Ref["schema"]; name: To }> extends infer E
			? E extends AnyErr
				? E
				: RenameRel<DB, Ref, To>
			: never
		: SqlError<`relation "${To}" already exists`, null>;

type SetSchema<DB, Ref extends TableRef, S extends string, Rel> =
	SchemaExists<DB, S> extends false
		? NoSchema<S>
		: GetRel<DB, { schema: S; name: Ref["name"] }> extends null
			? SchemaClash<DB, { schema: S; name: Ref["name"] }> extends infer E
				? E extends AnyErr
					? E
					: PutRel<DelRel<DB, Ref>, { schema: S; name: Ref["name"] }, Rel>
				: never
			: SqlError<
					`relation "${Ref["name"]}" already exists in schema "${S}"`,
					null
				>;

type RenameColumn<
	DB,
	Ref extends TableRef,
	Rel,
	F extends string,
	To extends string,
> = F extends keyof ColsOf<Rel>
	? To extends keyof ColsOf<Rel>
		? SqlError<
				`column "${To}" of relation "${Ref["name"]}" already exists`,
				null
			>
		: PutRel<DB, Ref, Rewrap<Rel, RenameKey<ColsOf<Rel>, F, To>>>
	: SqlError<`column "${F}" does not exist`, null>;

type ViewActionName = {
	add_column: "ADD COLUMN";
	drop_column: "DROP COLUMN";
	alter_type: "ALTER COLUMN ... SET DATA TYPE";
	set_not_null: "ALTER COLUMN ... SET NOT NULL";
	drop_not_null: "ALTER COLUMN ... DROP NOT NULL";
	add_identity: "ALTER COLUMN ... ADD IDENTITY";
	add_pk: "ADD CONSTRAINT";
};

type ViewActionError<As, TN extends string> = As extends readonly [
	{ readonly t: infer K },
	...infer R,
]
	? K extends keyof ViewActionName
		? SqlError<
				`ALTER action ${ViewActionName[K]} cannot be performed on relation "${TN}"`,
				null
			>
		: ViewActionError<R, TN>
	: null;

type RunPasses<Tbl, As, TN extends string> =
	RunPass<
		Tbl,
		As,
		TN,
		"drop_column" | "drop_not_null" | "drop_default"
	> extends infer T1
		? T1 extends AnyErr
			? T1
			: RunPass<T1, As, TN, "alter_type"> extends infer T2
				? T2 extends AnyErr
					? T2
					: RunPass<T2, As, TN, "add_column"> extends infer T3
						? T3 extends AnyErr
							? T3
							: RunPass<
										T3,
										As,
										TN,
										"set_not_null" | "add_identity" | "add_pk"
									> extends infer T4
								? T4 extends AnyErr
									? T4
									: RunPass<T4, As, TN, "set_default">
								: never
						: never
				: never
		: never;

type RunPass<Tbl, As, TN extends string, K> = As extends readonly [
	infer A,
	...infer R,
]
	? A extends { readonly t: K }
		? ColAction<Tbl, A, TN> extends infer T2
			? T2 extends AnyErr
				? T2
				: RunPass<T2, R, TN, K>
			: never
		: RunPass<Tbl, R, TN, K>
	: Tbl;

type NoColumn<C extends string, TN extends string> = SqlError<
	`column "${C}" of relation "${TN}" does not exist`,
	null
>;

type ColAction<Tbl, A, TN extends string> = A extends {
	readonly t: "add_column";
	readonly ifNotExists: infer Ine;
	readonly col: infer D extends ColumnDef;
}
	? D["name"] extends keyof Tbl
		? Ine extends true
			? Tbl
			: SqlError<
					`column "${D["name"]}" of relation "${TN}" already exists`,
					null
				>
		: SetKey<Tbl, D["name"], DescOf<D>>
	: A extends {
				readonly t: "drop_column";
				readonly ifExists: infer Ife;
				readonly name: infer C extends string;
			}
		? C extends keyof Tbl
			? DelKey<Tbl, C>
			: Ife extends true
				? Tbl
				: NoColumn<C, TN>
		: A extends { readonly t: "add_pk"; readonly cols: infer Cs }
			? FirstMissing<Cs, Tbl> extends infer M extends string
				? NoColumn<M, TN>
				: Cs extends readonly string[]
					? Rebuild<{
							[K in keyof Tbl]: K extends Cs[number]
								? WithNullable<Tbl[K], false>
								: Tbl[K];
						}>
					: Tbl
			: A extends {
						readonly t: infer Kind;
						readonly name: infer C extends string;
					}
				? C extends keyof Tbl
					? ModifyCol<Tbl[C], Kind, A, C, TN> extends infer D2
						? D2 extends AnyErr
							? D2
							: SetKey<Tbl, C, D2>
						: never
					: NoColumn<C, TN>
				: Tbl;

type ModifyCol<
	D,
	Kind,
	A,
	C extends string,
	TN extends string,
> = Kind extends "alter_type"
	? A extends { readonly type: infer Ty extends string }
		? WithType<D, Ty>
		: D
	: Kind extends "set_not_null"
		? WithNullable<D, false>
		: Kind extends "drop_not_null"
			? WithNullable<D, true>
			: Kind extends "set_default"
				? WithDefault<D, true>
				: Kind extends "drop_default"
					? WithDefault<D, false>
					: Kind extends "add_identity"
						? NullOf<D> extends true
							? SqlError<
									`column "${C}" of relation "${TN}" must be declared NOT NULL before identity can be added`,
									null
								>
							: WithDefault<D, true>
						: D;
