import type { Simplify } from "../../engine/object.js";
import type { MaxParam, NullTest, ParamsToMap } from "../../engine/params.js";
import type { Toks, TooLong, TooManyTokens } from "../../engine/tokens.js";
import type { Cols } from "../../engine/types.js";
import type * as Call from "../../sql/call.js";
import type * as Frag from "../../sql/fragment.js";
import type * as Shared from "../../sql/infer.js";
import type * as Inline from "../../sql/inline.js";
import type * as Named from "../../sql/named.js";
import type * as Splices from "../../sql/splice.js";
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
import type { QueryContext } from "./types.js";

export type Analyze<DB, Q extends string> =
	Named.RewriteNamed<Q, Lexis> extends [infer Q1 extends string, infer Names]
		? FastSelect<Q1> extends infer F
			? [F] extends [never]
				? AnalyzeGeneral<DB, Q1, Names>
				: F extends {
							stmt: infer S extends Stmt;
							max: infer M extends number;
						}
					? ProjectStmt<
							S,
							QueryContext<FastProjectionDb<DB, S, M, Q1>, [], {}>
						> extends infer C
						? C extends Cols | null
							? {
									readonly kind: S["t"];
									readonly cols: C;
									readonly params: FastParams<S, DB, M>;
									readonly max: M;
									readonly names: Names;
									readonly stmt: S;
								}
							: AnalyzeGeneral<DB, Q1, Names>
						: never
					: AnalyzeGeneral<DB, Q1, Names>
			: never
		: Named.RewriteNamed<Q, Lexis>;

type AnalyzeGeneral<DB, Q1 extends string, Names> =
	Lex<Q1> extends infer T
		? T extends Toks
			? TooManyTokens<T> extends true
				? TooLong<T>
				: AnalyzeTokens<DB, Q1, Names, T>
			: T
		: never;

type AnalyzeTokens<DB, Q1 extends string, Names, T extends Toks> =
	ParseProgram<T> extends infer S
		? S extends Stmt
			? (
					MaxParam<T> extends 0
						? {}
						: ParamsToMap<ParamsOfStmt<S, DB>>
				) extends infer P
				? ProjectStmt<
						S,
						QueryContext<ProjectionDb<DB, P, Q1>, [], {}>
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
		: never;

// Only casts read which parameters accept NULL; a text that merely looks like one costs a little.
type ProjectionDb<DB, P, Q extends string> =
	Lowercase<Q> extends
		| `${string}$${string}::${string}`
		| `${string}cast${string}$${string}`
		? WithNullParams<DB, NullParams<P>>
		: DB;

type FastParams<S extends Stmt, DB, M> = M extends 0
	? {}
	: ParamsToMap<ParamsOfStmt<S, DB, true>>;

// FastSelect's select list has no `$`, so a cast reaches the output only through
// a FROM item that isn't a table, or another branch of a set operation.
type FastProjectionDb<DB, S extends Stmt, M, Q extends string> = S extends {
	readonly body: {
		readonly t: "simple";
		readonly from: infer F extends readonly unknown[];
	};
}
	? [NotTables<F[number]>] extends [never]
		? DB
		: ProjectionDb<DB, FastParams<S, DB, M>, Q>
	: ProjectionDb<DB, FastParams<S, DB, M>, Q>;
type NotTables<I> = I extends { readonly t: "table" }
	? never
	: I extends {
				readonly t: "join";
				readonly l: infer L;
				readonly r: infer R;
			}
		? NotTables<L> | NotTables<R>
		: I;

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

/**
 * `SkipTargets` leaves out the select list, for the fast path only: FastSelect
 * takes no statement with a `$` in its select list, so no parameter is there.
 */
type ParamsOfStmt<
	S extends Stmt,
	DB,
	SkipTargets extends boolean = false,
> = SettleSortKeys<
	S extends SelectStmt
		? ParamsOfSelect<S, QueryContext<DB, [], {}>, SkipTargets>
		: S extends DmlStmt
			? ParamsOfDml<S, DB, {}>
			: S extends {
						readonly t: "declare_cursor";
						readonly q: infer Q extends SelectStmt;
					}
				? ParamsOfSelect<Q, QueryContext<DB, [], {}>>
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

type Lexis = PgEngine["lexis"];

export type RewriteNamed<Q extends string> = Named.RewriteNamed<Q, Lexis>;

export type RewriteInlineStr<
	T extends string,
	Start extends number,
> = Inline.RewriteInlineStr<T, Start, Lexis>;

export type MaxParamStr<T extends string> = Splices.MaxParamStr<T, Lexis>;

export type Splice<Q extends string, S> = Splices.Splice<Q, S, Lexis>;

export type JoinedText<
	Items extends readonly { readonly text: string }[],
	Sep extends string,
	Off extends number = 0,
> = Splices.JoinedText<Items, Sep, Lexis, Off>;

export type SplicedText<Q extends string> = Call.SplicedText<Q, Lexis>;

export type ListRep<
	E,
	Sep extends string,
	Wrap extends boolean = false,
> = Frag.ListRep<E, Sep, Lexis, Wrap>;
