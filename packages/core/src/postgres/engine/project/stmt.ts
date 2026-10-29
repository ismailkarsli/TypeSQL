import type { CteMap, Scope } from "../../../engine/types.js";
import type { AnyErr } from "../../../errors.js";
import type { DmlStmt, Stmt } from "../ast.js";
import type { ProjectDml } from "./dml.js";
import type { ProjectSelectParts } from "./select.js";

export type ProjectStmt<
	S extends Stmt,
	DB,
	Outer extends Scope,
	Ctes extends CteMap,
> = S extends { readonly t: "select" }
	? ProjectSelectParts<S["with"], S["body"], S["orderBy"], DB, Outer, Ctes>
	: S extends DmlStmt
		? ProjectDml<S, DB, Outer, Ctes>
		: S extends { readonly t: "declare_cursor" }
			? ProjectSelectParts<
					S["q"]["with"],
					S["q"]["body"],
					S["q"]["orderBy"],
					DB,
					Outer,
					Ctes
				> extends infer C
				? C extends AnyErr
					? C
					: null
				: never
			: null;
