import type { CteMap, Scope } from "../../../engine/types.js";
import type { AnyErr } from "../../../errors.js";
import type { DmlStmt, SelectStmt, Stmt, Tag } from "../ast.js";
import type { ProjectDml } from "./dml.js";
import type { ProjectSelect } from "./select.js";

export type ProjectStmt<
	S extends Stmt,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> =
	S extends Tag<"select">
		? ProjectSelect<Extract<S, SelectStmt>, DB, Outer, Ctes>
		: S extends DmlStmt
			? ProjectDml<S, DB, Outer, Ctes>
			: S extends Tag<"declare_cursor">
				? ProjectSelect<S["q"], DB, Outer, Ctes> extends AnyErr
					? ProjectSelect<S["q"], DB, Outer, Ctes>
					: null
				: null;
