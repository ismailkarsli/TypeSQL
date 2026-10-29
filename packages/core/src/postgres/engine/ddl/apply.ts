import type { AnyErr, SqlError } from "../../../errors.js";
import type { SelectStmt, TableRef } from "../ast.js";
import type { ProjectSelect } from "../project/select.js";
import type { ApplyAlterTable } from "./alter-table.js";
import type {
	ApplyCreateTable,
	ApplyCreateTableAs,
	ApplyTypedTable,
} from "./create-table.js";
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
	ApplyElements,
	ApplyRenameSchema,
} from "./schema.js";
import type { ApplyCreateView } from "./view.js";

export type ApplyDdlNode<DB, S> = S extends {
	readonly t: "noop" | "fetch" | "move" | "close_cursor";
}
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
		: S extends {
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
				: ApplyCreateTable<DB, Ine, Ref, Defs, Cons, Likes, Inh>
			: S extends {
						readonly t: "create_table_as";
						readonly ifNotExists: infer Ine;
						readonly table: infer Ref extends TableRef;
						readonly cols: infer Names;
						readonly q: infer Q;
					}
				? ApplyCreateTableAs<DB, Ine, Ref, Names, Q>
				: S extends {
							readonly t: "alter_table";
							readonly ifExists: infer Ife;
							readonly table: infer Ref extends TableRef;
							readonly actions: infer As;
						}
					? ApplyAlterTable<DB, Ife, Ref, As>
					: S extends {
								readonly t: "drop_table";
								readonly ifExists: infer Ife;
								readonly tables: infer Refs;
							}
						? ApplyDropRels<DB, Refs, Ife, "table">
						: S extends {
									readonly t: "create_view";
									readonly orReplace: infer OrR;
									readonly ifNotExists: infer Ine;
									readonly view: infer Ref extends TableRef;
									readonly cols: infer Names;
									readonly q: infer Q;
								}
							? ApplyCreateView<DB, OrR, Ine, Ref, Names, Q>
							: S extends {
										readonly t: "drop_view";
										readonly ifExists: infer Ife;
										readonly materialized: infer Mat;
										readonly views: infer Refs;
									}
								? ApplyDropRels<
										DB,
										Refs,
										Ife,
										Mat extends true ? "materialized view" : "view"
									>
								: S extends {
											readonly t: "create_enum";
											readonly name: {
												readonly name: infer Name extends string;
											};
											readonly values: infer Vs extends readonly string[];
										}
									? ApplyCreateEnum<DB, Name, Vs>
									: S extends {
												readonly t: "alter_enum";
												readonly name: {
													readonly name: infer Name extends string;
												};
												readonly action: infer Act;
											}
										? ApplyAlterEnum<DB, Name, Act>
										: S extends {
													readonly t: "drop_type";
													readonly ifExists: infer Ife;
													readonly names: infer Refs;
													readonly cascade: infer Casc;
												}
											? ApplyDropTypes<DB, Refs, Ife, Casc>
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
												: S extends {
															readonly t: "drop_schema";
															readonly ifExists: infer Ife;
															readonly names: infer Names;
															readonly cascade: infer Casc;
														}
													? ApplyDropSchemas<DB, Names, Ife, Casc>
													: S extends {
																readonly t: "rename_schema";
																readonly from: infer F extends string;
																readonly to: infer To extends string;
															}
														? ApplyRenameSchema<DB, F, To>
														: S extends {
																	readonly t: "create_function";
																	readonly name: {
																		readonly name: infer Name extends string;
																	};
																	readonly ret: infer Ret extends string;
																	readonly srf: infer Srf;
																}
															? ApplyCreateFunction<DB, Name, Ret, Srf>
															: SqlError<"unsupported DDL statement", null>;
