import type { Shaped, TsShape } from "../../../schema.js";

export type JsonShapeOf<T> = T extends {
	readonly shape: { readonly k: "ts"; readonly v: infer V };
}
	? [V]
	: null;

export type JsonStep = { readonly key: string } | { readonly index: true };
type Step = JsonStep;

export type JsonPath<E> = E extends {
	readonly t: "str";
	readonly v: infer P extends string;
}
	? P extends `$${infer R}`
		? Steps<R, []>
		: null
	: null;

type Steps<S extends string, Acc extends readonly Step[]> = S extends ""
	? Acc
	: S extends `[*]${string}` | `**${string}` | `.*${string}`
		? null
		: S extends `.${infer R}`
			? R extends `"${infer K}"${infer R2}`
				? Steps<R2, [...Acc, { readonly key: K }]>
				: KeyRun<R, ""> extends [
							infer K extends string,
							infer R2 extends string,
						]
					? Steps<R2, [...Acc, { readonly key: K }]>
					: null
			: S extends `[${string}]${infer R}`
				? Steps<R, [...Acc, { readonly index: true }]>
				: null;
type KeyRun<
	S extends string,
	Acc extends string,
> = S extends `${infer C}${infer R}`
	? C extends "." | "["
		? [Acc, S]
		: KeyRun<R, `${Acc}${C}`>
	: [Acc, S];

type Walk<
	V,
	P extends readonly Step[],
	Missing extends boolean,
> = P extends readonly [infer H, ...infer R extends readonly Step[]]
	? [Exclude<V, null | undefined>] extends [never]
		? [null, true]
		: H extends { readonly key: infer K extends string }
			? Exclude<V, null | undefined> extends infer O
				? O extends readonly unknown[]
					? [unknown, true]
					: O extends object
						? K extends keyof O
							? Walk<
									O[K],
									R,
									Absent<Missing, V, {} extends Pick<O, K> ? true : false>
								>
							: string extends keyof O
								? Walk<O[string & keyof O], R, true>
								: [never, true]
						: [unknown, true]
				: never
			: Exclude<V, null | undefined> extends readonly (infer El)[]
				? Walk<El, R, true>
				: [unknown, true]
	: [V, Absent<Missing, V, false>];
type Absent<Missing extends boolean, V, Else> = Missing extends true
	? true
	: null extends V
		? true
		: undefined extends V
			? true
			: Else;

/** The text `->>` gives for a JSON value: strings as they are, other values as JSON text. */
type TextOf<V> = V extends string ? V : string;

export type JsonGet<V, P extends readonly Step[], Kind extends "->" | "->>"> =
	Walk<V, P, false> extends [infer X, infer N extends boolean]
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
