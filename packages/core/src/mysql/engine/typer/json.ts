import type {
	JsonStep,
	JsonSteps,
	JsonWalk,
} from "../../../engine/family/json.js";
import type { Shaped, TsShape } from "../../../schema.js";

/** MySQL paths with wildcards (`[*]`, `.*`, `**`) find several values. */
type Wildcard = `[*]${string}` | `**${string}` | `.*${string}`;

export type JsonPath<E> = E extends {
	readonly t: "str";
	readonly v: infer P extends string;
}
	? P extends `$${infer R}`
		? JsonSteps<R, Wildcard>
		: null
	: null;

/** The text `->>` gives for a JSON value: strings as they are, other values as JSON text. */
type TextOf<V> = V extends string ? V : string;

export type JsonGet<
	V,
	P extends readonly JsonStep[],
	Kind extends "->" | "->>",
> =
	JsonWalk<V, P, false> extends [infer X, infer N extends boolean]
		? unknown extends X
			? {
					readonly type: Kind extends "->" ? "json" : "longtext";
					readonly nullable: true;
				}
			: [Exclude<X, null | undefined>] extends [never]
				? Kind extends "->"
					? {
							readonly type: Shaped<"json", TsShape<null>>;
							readonly nullable: N;
						}
					: {
							readonly type: Shaped<"longtext", TsShape<"null">>;
							readonly nullable: N;
						}
				: {
						readonly type: Kind extends "->"
							? Shaped<"json", TsShape<Exclude<X, undefined>>>
							: Shaped<"longtext", TsShape<TextOf<Exclude<X, undefined>>>>;
						readonly nullable: N;
					}
		: never;
