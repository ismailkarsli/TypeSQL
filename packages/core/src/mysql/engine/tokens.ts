export type MyWord<V extends string, R extends string, G extends string> = {
	readonly k: "w";
	readonly v: V;
	readonly r: R;
	readonly g: G;
};
export type MyIdent<
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
export type MyNum<V extends string, G extends string> = {
	readonly k: "n";
	readonly v: V;
	readonly g: G;
};
export type MyStr<
	V extends string,
	R extends string,
	G extends string,
	F extends string = V,
> = {
	readonly k: "s";
	readonly v: V;
	readonly r: R;
	readonly g: G;
	/** The first of adjacent strings (`'a' 'b'`), which MySQL names the column after. */
	readonly f: F;
};
export type MyBlob<V extends string, R extends string, G extends string> = {
	readonly k: "s";
	readonly v: V;
	readonly r: R;
	readonly g: G;
	readonly blob: true;
};
export type MyParam<N extends number, G extends string> = {
	readonly k: "$";
	readonly v: N;
	readonly g: G;
};
export type MyOp<V extends string, G extends string> = {
	readonly k: "o";
	readonly v: V;
	readonly g: G;
};

/** The text of a token as the server sees it: parameters are sent as `?`. */
export type RawOf<T> = T extends { readonly r: infer R extends string }
	? R
	: T extends { readonly k: "$" }
		? "?"
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
export type MyVar<V extends string, R extends string, G extends string> = {
	readonly k: "v";
	readonly v: V;
	readonly r: R;
	readonly g: G;
};
