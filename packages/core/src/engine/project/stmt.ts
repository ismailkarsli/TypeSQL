import type { DdlStmt, DmlStmt, Stmt } from "../ast.js";
import type { AnyErr } from "../errors.js";
import type { Cols, CteMap, Scope } from "../types.js";
import type { ProjectDml } from "./dml.js";
import type { ProjectSelectParts } from "./select.js";

/**
 * Project any statement:
 *   SELECT / VALUES → `Cols`
 *   DML (INSERT / UPDATE / DELETE / MERGE) with RETURNING → `Cols`; without → `null`
 *   DDL → `null`; DECLARE … CURSOR checks its query, then `null` (it returns no rows)
 * or `SqlError`. SELECT is recognized by its tag only (no structural comparison of the tree).
 */
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
			: S extends DdlStmt
				? null
				: never;

export type { Cols };
