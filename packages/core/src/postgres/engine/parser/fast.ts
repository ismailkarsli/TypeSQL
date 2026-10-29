import type { Ws } from "../../../engine/chars.js";
import type { MaxParam } from "../../../engine/params.js";
import type { Toks } from "../../../engine/tokens.js";
import type { Lex } from "../lexer/lex.js";
import type {
	ParseSelectTail,
	ParseSimpleAfterTargets,
	ParseTargetList,
} from "./select.js";
import type { Ok } from "./util.js";

export type FastSelect<Q extends string> =
	Q extends `${string}${"SELECT" | "select"}${string}`
		? FastSelectStart<Q>
		: never;
type FastSelectStart<Q extends string> =
	TrimStart<Q> extends `${"SELECT" | "select"}${Ws}${infer Rest}`
		? SplitFrom<TrimStart<Rest>>
		: never;

type SplitFrom<S extends string> = S extends `${infer Cs}FROM${Ws}${infer Rest}`
	? Cs extends `${string}${Ws}`
		? SelectFrom<Cs, TrimStart<Rest>>
		: never
	: S extends `${infer Cs}from${Ws}${infer Rest}`
		? Cs extends `${string}${Ws}`
			? SelectFrom<Cs, TrimStart<Rest>>
			: never
		: never;
type SelectFrom<
	Cs extends string,
	Rest extends string,
> = Cs extends `${string}--${string}`
	? never
	: AllTargets<Cs> extends infer Ts
		? Ts extends readonly unknown[]
			? GeneralTail<Ts, Rest>
			: never
		: never;
type AllTargets<S extends string> = S extends `${string}$${string}`
	? null
	: ParsedTargets<S>;
type ParsedTargets<S extends string> =
	Lex<S> extends infer T
		? T extends Toks
			? ParseTargetList<T, 0, []> extends Ok<infer Cs, infer J>
				? T[J] extends undefined
					? Cs
					: null
				: null
			: null
		: null;

type GeneralTail<
	Ts,
	Rest extends string,
> = Rest extends `${string}${"--" | "/*"}${string}`
	? WholeTail<Ts, Rest>
	: LastOrder<Rest> extends [
				infer Body extends string,
				infer Order extends string,
			]
		? SplitOrder<Ts, Body, Order> extends infer S
			? [S] extends [never]
				? WholeTail<Ts, Rest>
				: S
			: never
		: WholeTail<Ts, Rest>;

type LastOrder<S extends string> = [OrderTail<S>] extends [never]
	? never
	: OrderTail<S> extends infer Tail extends string
		? S extends `${infer Body}ORDER BY${Tail}`
			? [Body, Tail]
			: S extends `${infer Body}order by${Tail}`
				? [Body, Tail]
				: never
		: never;
type OrderTail<S extends string> =
	S extends `${infer Before}ORDER BY${infer After}`
		? Before extends `${string}${Ws}`
			? After extends `${Ws}${string}`
				? [OrderTail<After>] extends [never]
					? After
					: OrderTail<After>
				: never
			: never
		: S extends `${infer Before}order by${infer After}`
			? Before extends `${string}${Ws}`
				? After extends `${Ws}${string}`
					? [OrderTail<After>] extends [never]
						? After
						: OrderTail<After>
					: never
				: never
			: never;

type SplitOrder<Ts, Body extends string, Order extends string> =
	Lex<`FROM ${Body}`> extends infer BT
		? BT extends Toks
			? ParseSimpleAfterTargets<BT, 0, false, Ts> extends Ok<infer B, infer J>
				? BT[J] extends undefined
					? Lex<`ORDER BY${Order}`> extends infer OT
						? OT extends Toks
							? ParseSelectTail<OT, B, null, 0> extends Ok<
									infer Stmt,
									infer End
								>
								? OT[End] extends undefined
									? { stmt: Stmt; max: MaxParam<[...BT, ...OT]> }
									: never
								: never
							: never
						: never
					: never
				: never
			: never
		: never;

type WholeTail<Ts, Rest extends string> =
	Lex<`FROM ${Rest}`> extends infer T
		? T extends Toks
			? ParseSimpleAfterTargets<T, 0, false, Ts> extends Ok<infer Body, infer J>
				? ParseSelectTail<T, Body, null, J> extends Ok<infer Stmt, infer End>
					? T[End] extends undefined
						? { stmt: Stmt; max: MaxParam<T> }
						: never
					: never
				: never
			: never
		: never;

type TrimStart<
	S extends string,
	B extends unknown[] = [],
> = B["length"] extends 128
	? S
	: S extends `${Ws}${infer R}`
		? TrimStart<R, [...B, 0]>
		: S;
