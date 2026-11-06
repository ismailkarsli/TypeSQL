// JSON paths of the MySQL and SQLite engines: the steps of a `$…` path and
// the TypeScript type they reach in a column's declared JSON type.

import type { TsShaped } from "../../schema.js";

/** The declared TypeScript type of a JSON column, as `[T]`, or `null`. */
export type JsonShapeOf<T> = T extends TsShaped<infer V> ? [V] : null;

export type JsonStep = { readonly key: string } | { readonly index: true };

/**
 * The steps of `S`, a path after its `$`, or `null` for a path the type
 * can't follow: one with a step matching `Wild`.
 */
export type JsonSteps<
	S extends string,
	Wild,
	Acc extends readonly JsonStep[] = [],
> = S extends ""
	? Acc
	: S extends Wild
		? null
		: S extends `.${infer R}`
			? R extends `"${infer K}"${infer R2}`
				? JsonSteps<R2, Wild, [...Acc, { readonly key: K }]>
				: KeyRun<R, ""> extends [
							infer K extends string,
							infer R2 extends string,
						]
					? JsonSteps<R2, Wild, [...Acc, { readonly key: K }]>
					: null
			: S extends `[${string}]${infer R}`
				? JsonSteps<R, Wild, [...Acc, { readonly index: true }]>
				: null;
type KeyRun<
	S extends string,
	Acc extends string,
> = S extends `${infer C}${infer R}`
	? C extends "." | "["
		? [Acc, S]
		: KeyRun<R, `${Acc}${C}`>
	: [Acc, S];

/**
 * The type path `P` reaches in `V`, and whether it may find nothing:
 * `unknown` where the type doesn't say.
 */
export type JsonWalk<
	V,
	P extends readonly JsonStep[],
	Missing extends boolean,
> = P extends readonly [infer H, ...infer R extends readonly JsonStep[]]
	? [Exclude<V, null | undefined>] extends [never]
		? [null, true]
		: H extends { readonly key: infer K extends string }
			? Exclude<V, null | undefined> extends infer O
				? O extends readonly unknown[]
					? [unknown, true]
					: O extends object
						? K extends keyof O
							? JsonWalk<
									O[K],
									R,
									Absent<Missing, V, {} extends Pick<O, K> ? true : false>
								>
							: string extends keyof O
								? JsonWalk<O[string & keyof O], R, true>
								: [never, true]
						: [unknown, true]
				: never
			: Exclude<V, null | undefined> extends readonly (infer El)[]
				? JsonWalk<El, R, true>
				: [unknown, true]
	: [V, Absent<Missing, V, false>];
type Absent<Missing extends boolean, V, Else> = Missing extends true
	? true
	: null extends V
		? true
		: undefined extends V
			? true
			: Else;
