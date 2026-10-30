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
> = S extends TagSelect
	? ProjectSelectParts<S["with"], S["body"], S["orderBy"], DB, Outer, Ctes>
	: S extends DmlStmt
		? ProjectDml<S, DB, Outer, Ctes>
		: S extends TagDeclareCursor
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

type TagSelect = { readonly t: "select" };
type TagDeclareCursor = { readonly t: "declare_cursor" };
