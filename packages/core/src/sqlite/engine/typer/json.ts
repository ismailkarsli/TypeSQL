import type {
	JsonStep,
	JsonSteps,
	JsonWalk,
} from "../../../engine/family/json.js";
import type { Shaped, TsShape } from "../../../schema.js";

export type JsonPath<E> = E extends {
	readonly t: "str";
	readonly v: infer P extends string;
}
	? P extends `$${infer R}`
		? JsonSteps<R, never>
		: [{ readonly key: P }]
	: E extends { readonly t: "num"; readonly v: string }
		? [{ readonly index: true }]
		: null;

type SqlValue<V> = V extends boolean
	? 0 | 1
	: V extends string | number | bigint
		? V
		: V extends null | undefined
			? never
			: string;

export type JsonGet<
	V,
	P extends readonly JsonStep[],
	Kind extends "->" | "->>",
> =
	JsonWalk<V, P, false> extends [infer X, infer N extends boolean]
		? unknown extends X
			? {
					readonly type: Kind extends "->" ? "text" : "any";
					readonly nullable: true;
				}
			: [Exclude<X, null | undefined>] extends [never]
				? { readonly type: "null"; readonly nullable: true }
				: {
						readonly type: Kind extends "->"
							? Shaped<"json", TsShape<Exclude<X, undefined>>>
							: Shaped<"any", TsShape<SqlValue<X>>>;
						readonly nullable: N;
					}
		: never;
