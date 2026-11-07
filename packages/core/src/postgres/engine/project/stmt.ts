import type { AnyErr } from "../../../errors.js";
import type { DmlStmt, SelectStmt, Stmt, Tag } from "../ast.js";
import type { QueryContext } from "../types.js";
import type { ProjectDml } from "./dml.js";
import type { ProjectSelect } from "./select.js";

export type ProjectStmt<S extends Stmt, Env extends QueryContext> =
	S extends Tag<"select">
		? ProjectSelect<Extract<S, SelectStmt>, Env>
		: S extends DmlStmt
			? ProjectDml<S, Env>
			: S extends Tag<"declare_cursor" | "create_index">
				? ProjectSelect<S["q"], Env> extends AnyErr
					? ProjectSelect<S["q"], Env>
					: null
				: null;
