import type * as Shared from "../../engine/infer.js";
import type { MaxParam, NullTest, ParamsToMap } from "../../engine/params.js";
import type { Toks } from "../../engine/tokens.js";
import type { Cols, Simplify } from "../../engine/types.js";
import type { RewriteNamed } from "../../sql/named.js";
import type { TsOf } from "../type-map/index.js";
import type { DmlStmt, SelectStmt, Stmt } from "./ast.js";
import type { ApplyDdlAll } from "./ddl/script.js";
import type { Reposition } from "./diagnostics.js";
import type { PgEngine } from "./engine.js";
import type { Lex } from "./lexer/lex.js";
import type { FastSelect } from "./parser/fast.js";
import type { ParseProgram } from "./parser/stmt.js";
import type { ParamsOfDml } from "./project/dml.js";
import type { ProjectStmt } from "./project/stmt.js";
import type { ParamsOfSelect, SettleSortKeys } from "./typer/params.js";

export type Analyze<DB, Q extends string> =
	RewriteNamed<Q> extends [infer Q1 extends string, infer Names]
		? FastSelect<Q1> extends infer F
			? [F] extends [never]
				? AnalyzeGeneral<DB, Q1, Names>
				: F extends {
							stmt: infer S extends Stmt;
							max: infer M extends number;
						}
					? ProjectStmt<S, DB, [], {}> extends infer C
						? C extends Cols | null
							? {
									readonly kind: S["t"];
									readonly cols: C;
									readonly params: M extends 0
										? {}
										: ParamsToMap<ParamsOfStmt<S, DB, true>>;
									readonly max: M;
									readonly names: Names;
									readonly stmt: S;
								}
							: AnalyzeGeneral<DB, Q1, Names>
						: never
					: AnalyzeGeneral<DB, Q1, Names>
			: never
		: RewriteNamed<Q>;

type AnalyzeGeneral<DB, Q1 extends string, Names> =
	Lex<Q1> extends infer T
		? T extends Toks
			? ParseProgram<T> extends infer S
				? S extends Stmt
					? (
							MaxParam<T> extends 0
								? {}
								: ParamsToMap<ParamsOfStmt<S, DB>>
						) extends infer P
						? ProjectStmt<
								S,
								WithNullParams<DB, NullParams<P>>,
								[],
								{}
							> extends infer C
							? C extends Cols | null
								? {
										readonly kind: S["t"];
										readonly cols: C;
										readonly params: P;
										readonly max: MaxParam<T>;
										readonly names: Names;
										readonly stmt: S;
									}
								: Reposition<C, T, DB>
							: never
						: never
					: Reposition<S, T, DB>
				: never
			: T
		: never;

/** Parameters that accept null, with the same rule the parameter types use. */
type NullParams<P> = {
	[K in keyof P]: [
		Extract<P[K], NullTest | { readonly nullable: false }>,
	] extends [never]
		? K
		: [Extract<P[K], NullTest>] extends [never]
			? never
			: K;
}[keyof P];
// A cast parameter types as its cast; one that accepts null makes it nullable.
type WithNullParams<DB, N> = [N] extends [never]
	? DB
	: DB & { readonly $nullParams: N };

export type Analysis<DB, Q extends string> = Analyze<DB, Q>;

type ParamsOfStmt<
	S extends Stmt,
	DB,
	SkipTargets extends boolean = false,
> = SettleSortKeys<
	S extends SelectStmt
		? ParamsOfSelect<S, DB, [], {}, never, SkipTargets>
		: S extends DmlStmt
			? ParamsOfDml<S, DB, {}, never>
			: S extends {
						readonly t: "declare_cursor";
						readonly q: infer Q extends SelectStmt;
					}
				? ParamsOfSelect<Q, DB, [], {}, never>
				: never
>;

export type RowOf<DB, TM, Q extends string> = Shared.RowOf<PgEngine, DB, TM, Q>;

export type BuildRow<
	M extends {
		readonly [k: string]: { readonly type: string; readonly nullable: boolean };
	},
	TM,
	DB,
> = RowFrom<M, TM, DB>;

// Normalize the row before Query inference to keep RowType within the depth limit.
export type RowFrom<M, TM, DB> = Simplify<{
	-readonly [K in keyof M]: TsOf<
		TM,
		DB,
		M[K] & { type: string; nullable: boolean }
	>;
}>;

export type ParamsOf<DB, TM, Q extends string> = Shared.ParamsOf<
	PgEngine,
	DB,
	TM,
	Q
>;

export type ArgsOf<DB, TM, Q extends string> = Shared.ArgsOf<
	PgEngine,
	DB,
	TM,
	Q
>;

export type NamesOf<DB, Q extends string> = Shared.NamesOf<PgEngine, DB, Q>;

export type ParamsArgs<DB, TM, Q extends string> = Shared.ParamsArgs<
	PgEngine,
	DB,
	TM,
	Q
>;

export type Validate<DB, Q extends string> = Shared.Validate<PgEngine, DB, Q>;

export type KindOf<DB, Q extends string> = Shared.KindOf<PgEngine, DB, Q>;

export type ApplyDdl<DB, Q extends string> = ApplyDdlAll<DB, Q>;
