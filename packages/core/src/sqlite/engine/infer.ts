import type { QueryContext } from "../../engine/family/types.js";
import type { Simplify } from "../../engine/object.js";
import type { MaxParam, ParamsToMap } from "../../engine/params.js";
import type { Toks } from "../../engine/tokens.js";
import type { Cols } from "../../engine/types.js";
import type { AnyErr } from "../../errors.js";
import type * as Call from "../../sql/call.js";
import type * as Shared from "../../sql/infer.js";
import type { RewriteNamed } from "../../sql/named.js";
import type { TsOf } from "../type-map/index.js";
import type { DmlStmt, SelectStmt, Stmt } from "./ast.js";
import type { ApplyDdlAll, ApplyOne } from "./ddl/apply.js";
import type { Reposition } from "./diagnostics.js";
import type { SqliteEngine } from "./engine.js";
import type { Lex } from "./lexer.js";
import type { ParseProgramAt } from "./parser/stmt.js";
import type { ParamsOfDml, ProjectDml } from "./project/dml.js";
import type { ProjectSelect } from "./project/select.js";
import type { ParamsOfSelect } from "./typer/params.js";

export type Analyze<DB, Q extends string> =
	RewriteNamed<Q, SqliteEngine["lexis"]> extends infer RN
		? RN extends [infer Q1 extends string, infer Names]
			? Lex<Q1> extends infer T
				? T extends Toks
					? ParseProgramAt<T> extends infer S
						? S extends Stmt
							? ProjectStmt<S, DB> extends infer C
								? C extends Cols | null
									? {
											readonly kind: S["t"];
											readonly cols: C;
											readonly params: MaxParam<T> extends 0
												? {}
												: ParamsToMap<ParamsOfStmt<S, DB>>;
											readonly max: MaxParam<T>;
											readonly names: Names;
										}
									: Reposition<C, T, DB>
								: never
							: Reposition<S, T, DB>
						: never
					: T
				: never
			: RN
		: never;

export type Analysis<DB, Q extends string> = Analyze<DB, Q>;

type ProjectStmt<S extends Stmt, DB> = S extends { readonly t: "select" }
	? ProjectSelect<Extract<S, SelectStmt>, QueryContext<DB, [], {}>>
	: S extends { readonly t: "insert" | "update" | "delete" }
		? ProjectDml<Extract<S, DmlStmt>, DB, {}>
		: ApplyStmt<S, DB>;

type ApplyStmt<S extends Stmt, DB> =
	ApplyOne<DB, S> extends infer R ? (R extends AnyErr ? R : null) : never;

type ParamsOfStmt<S extends Stmt, DB> = S extends { readonly t: "select" }
	? ParamsOfSelect<Extract<S, SelectStmt>, QueryContext<DB, [], {}>>
	: S extends { readonly t: "insert" | "update" | "delete" }
		? ParamsOfDml<Extract<S, DmlStmt>, DB, {}>
		: never;

export type RowOf<DB, TM, Q extends string> = Shared.RowOf<
	SqliteEngine,
	DB,
	TM,
	Q
>;

export type BuildRow<
	M extends {
		readonly [k: string]: { readonly type: string; readonly nullable: boolean };
	},
	TM,
	DB,
> = RowFrom<M, TM, DB>;

export type RowFrom<M, TM, DB> = Simplify<{
	-readonly [K in keyof M]: TsOf<
		TM,
		DB,
		M[K] & { type: string; nullable: boolean }
	>;
}>;

export type ParamsOf<DB, TM, Q extends string> = Shared.ParamsOf<
	SqliteEngine,
	DB,
	TM,
	Q
>;

export type ArgsOf<DB, TM, Q extends string> = Shared.ArgsOf<
	SqliteEngine,
	DB,
	TM,
	Q
>;

export type NamesOf<DB, Q extends string> = Shared.NamesOf<SqliteEngine, DB, Q>;

export type ParamsArgs<DB, TM, Q extends string> = Shared.ParamsArgs<
	SqliteEngine,
	DB,
	TM,
	Q
>;

export type Validate<DB, Q extends string> = Shared.Validate<
	SqliteEngine,
	DB,
	Q
>;

export type KindOf<DB, Q extends string> = Shared.KindOf<SqliteEngine, DB, Q>;

export type ApplyDdl<DB, Q extends string> = ApplyDdlAll<DB, Q>;

export type SplicedText<Q extends string> = Call.SplicedText<
	Q,
	SqliteEngine["lexis"]
>;
