import type { DdlStmt, DeleteStmt, InsertStmt, Stmt, UpdateStmt } from "../ast.js";
import type { Cols, CteMap, Scope } from "../types.js";
import type { ProjectDml } from "./dml.js";
import type { ProjectSelectParts } from "./select.js";

/**
 * Project any statement:
 *   SELECT / VALUES → `Cols`
 *   DML with RETURNING → `Cols`; without → `null`
 *   DDL → `null`
 * or `SqlError`. SELECT is recognized by its tag only (no structural comparison of the tree).
 */
export type ProjectStmt<S extends Stmt, DB, Outer extends Scope, Ctes extends CteMap> =
  S extends { readonly t: "select" } ? ProjectSelectParts<S["with"], S["body"], S["orderBy"], DB, Outer, Ctes>
  : S extends InsertStmt | UpdateStmt | DeleteStmt ? ProjectDml<S, DB, Outer, Ctes>
  : S extends DdlStmt ? null
  : never;

export type { Cols };
