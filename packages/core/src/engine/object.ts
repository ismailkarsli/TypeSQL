type Single<K extends PropertyKey, V> = { [P in K]: V };

type U2I<U> = (U extends unknown ? (x: U) => void : never) extends (
	x: infer I,
) => void
	? I
	: never;

type Flat<T> = { [K in keyof T]: T[K] } & {};

type Build<U> = [U] extends [never] ? {} : Flat<U2I<U>>;

export type Rebuild<O> = Build<
	{ [K in keyof O]: Single<K & string, O[K]> }[keyof O]
>;

export type SetKey<O, K extends string, V> = Build<
	| { [P in keyof O]: Single<P & string, P extends K ? V : O[P]> }[keyof O]
	| (K extends keyof O ? never : Single<K, V>)
>;

export type DelKey<O, K> = Build<
	{ [P in keyof O]: P extends K ? never : Single<P & string, O[P]> }[keyof O]
>;

export type RenameKey<O, From, To extends string> = Build<
	{ [P in keyof O]: Single<P extends From ? To : P & string, O[P]> }[keyof O]
>;

export type ApplyPatch<DB, Set, Del> = Build<
	| {
			[P in keyof DB]: P extends Del | keyof Set
				? never
				: Single<P & string, DB[P]>;
	  }[keyof DB]
	| { [K in keyof Set]: Single<K & string, Set[K]> }[keyof Set]
>;

export type PickOne<U> = (
	U extends unknown
		? (x: () => U) => void
		: never
) extends (x: infer F) => void
	? F extends () => infer R
		? R
		: never
	: never;
