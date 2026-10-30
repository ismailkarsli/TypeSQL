import type { Analyze } from "../../src/postgres/engine/infer.js";
import type { AnyShaped, BaseOf } from "../../src/postgres/engine/shape.js";

export type OracleAnalysis<DB, Q extends string> =
	Analyze<DB, Q> extends infer R
		? R extends {
				readonly stmt: unknown;
				readonly kind: infer K;
				readonly cols: infer C;
				readonly params: infer P;
				readonly max: infer M;
				readonly names: infer N;
			}
			? {
					readonly kind: K;
					readonly cols: Plain<C>;
					readonly params: Plain<P>;
					readonly max: M;
					readonly names: N;
				}
			: R
		: never;

type Plain<T> = T extends { readonly k: "ts"; readonly v: infer V }
	? { readonly k: "ts"; readonly v: V }
	: T extends string
		? T extends AnyShaped
			? BaseOf<T> & { readonly shape: Plain<T["shape"]> }
			: T
		: T extends object
			? { [K in keyof T]: Plain<T[K]> }
			: T;
