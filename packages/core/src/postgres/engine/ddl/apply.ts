import type { AnyErr, SqlError } from "../../../errors.js";
import type {
	AlterEnum,
	AlterTable,
	CreateEnum,
	CreateFunction,
	DropSchema,
	DropTable,
	DropType,
	DropView,
	RenameSchema,
	SelectStmt,
	TableRef,
	Tag,
} from "../ast.js";
import type { ProjectSelect } from "../project/select.js";
import type { ApplyAlterTable } from "./alter-table.js";
import type { ApplyCreateTableAs } from "./create-table.js";
import type {
	ApplyAlterEnum,
	ApplyCreateEnum,
	ApplyCreateFunction,
	ApplyDropTypes,
} from "./registry.js";
import type { ApplyDropRels } from "./relation.js";
import type {
	ApplyCreateSchema,
	ApplyDropSchemas,
	ApplyElement,
	ApplyElements,
	ApplyRenameSchema,
} from "./schema.js";

export type ApplyDdlNode<DB, S> =
	S extends Tag<"noop" | "fetch" | "move" | "close_cursor">
		? DB
		: S extends {
					readonly t: "declare_cursor";
					readonly q: infer Q extends SelectStmt;
				}
			? ProjectSelect<Q, DB, [], {}> extends infer C
				? C extends AnyErr
					? C
					: DB
				: never
			: S extends Tag<"create_table" | "create_view">
				? ApplyElement<DB, null, S>
				: S extends {
							readonly t: "create_table_as";
							readonly ifNotExists: infer Ine;
							readonly table: infer Ref extends TableRef;
							readonly cols: infer Names;
							readonly q: infer Q;
						}
					? ApplyCreateTableAs<DB, Ine, Ref, Names, Q>
					: S extends AlterTable
						? ApplyAlterTable<DB, S["ifExists"], S["table"], S["actions"]>
						: S extends DropTable
							? ApplyDropRels<DB, S["tables"], S["ifExists"], "table">
							: S extends DropView
								? ApplyDropRels<
										DB,
										S["views"],
										S["ifExists"],
										S["materialized"] extends true
											? "materialized view"
											: "view"
									>
								: S extends CreateEnum
									? ApplyCreateEnum<DB, S["name"]["name"], S["values"]>
									: S extends AlterEnum
										? ApplyAlterEnum<DB, S["name"]["name"], S["action"]>
										: S extends DropType
											? ApplyDropTypes<
													DB,
													S["names"],
													S["ifExists"],
													S["cascade"]
												>
											: S extends {
														readonly t: "create_schema";
														readonly ifNotExists: infer Ine;
														readonly name: infer Name extends string;
														readonly elements: infer Els;
													}
												? ApplyCreateSchema<DB, Ine, Name> extends infer DB2
													? DB2 extends AnyErr
														? DB2
														: ApplyElements<DB2, Name, Els>
													: never
												: S extends DropSchema
													? ApplyDropSchemas<
															DB,
															S["names"],
															S["ifExists"],
															S["cascade"]
														>
													: S extends RenameSchema
														? ApplyRenameSchema<DB, S["from"], S["to"]>
														: S extends CreateFunction
															? ApplyCreateFunction<
																	DB,
																	S["name"]["name"],
																	S["ret"],
																	S["srf"]
																>
															: SqlError<"unsupported DDL statement", null>;
