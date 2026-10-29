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
		: [{ readonly key: P }]
	: E extends { readonly t: "num"; readonly v: string }
		? [{ readonly index: true }]
		: null;

type Steps<S extends string, Acc extends readonly Step[]> = S extends ""
	? Acc
	: S extends `.${infer R}`
		? R extends `"${infer K}"${infer R2}`
			? Steps<R2, [...Acc, { readonly key: K }]>
			: KeyRun<R, ""> extends [infer K extends string, infer R2 extends string]
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
									Missing extends true
										? true
										: null extends V
											? true
											: undefined extends V
												? true
												: {} extends Pick<O, K>
													? true
													: false
								>
							: string extends keyof O
								? Walk<O[string & keyof O], R, true>
								: [never, true]
						: [unknown, true]
				: never
			: Exclude<V, null | undefined> extends readonly (infer El)[]
				? Walk<El, R, true>
				: [unknown, true]
	: [
			V,
			Missing extends true
				? true
				: null extends V
					? true
					: undefined extends V
						? true
						: false,
		];

type SqlValue<V> = V extends boolean
	? 0 | 1
	: V extends string | number | bigint
		? V
		: V extends null | undefined
			? never
			: string;

export type JsonGet<V, P extends readonly Step[], Kind extends "->" | "->>"> =
	Walk<V, P, false> extends [infer X, infer N extends boolean]
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
