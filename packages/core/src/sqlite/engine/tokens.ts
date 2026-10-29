export type SqWord<V extends string, R extends string, G extends string> = {
	readonly k: "w";
	readonly v: V;
	readonly r: R;
	readonly g: G;
};
export type SqIdent<
	V extends string,
	N extends string,
	R extends string,
	G extends string,
> = {
	readonly k: "id";
	readonly v: V;
	readonly n: N;
	readonly r: R;
	readonly g: G;
};
export type SqNum<V extends string, G extends string> = {
	readonly k: "n";
	readonly v: V;
	readonly g: G;
};
export type SqStr<V extends string, R extends string, G extends string> = {
	readonly k: "s";
	readonly v: V;
	readonly r: R;
	readonly g: G;
};
export type SqBlob<V extends string, R extends string, G extends string> = {
	readonly k: "s";
	readonly v: V;
	readonly r: R;
	readonly g: G;
	readonly blob: true;
};
export type SqParam<N extends number, G extends string> = {
	readonly k: "$";
	readonly v: N;
	readonly g: G;
};
export type SqOp<V extends string, G extends string> = {
	readonly k: "o";
	readonly v: V;
	readonly g: G;
};

export type RawOf<T> = T extends { readonly r: infer R extends string }
	? R
	: T extends { readonly k: "$"; readonly v: infer N extends number }
		? `$${N}`
		: T extends { readonly v: infer V extends string }
			? V
			: "";

export type NameOf<T> = T extends { readonly k: "id"; readonly n: infer N }
	? N
	: T extends { readonly k: "w"; readonly r: infer R }
		? R
		: T extends { readonly k: "s"; readonly v: infer V }
			? V
			: never;
