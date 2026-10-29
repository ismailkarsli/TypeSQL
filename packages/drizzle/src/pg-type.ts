export function pgType<B, const T extends string>(
	builder: B,
	type: T,
): B & { readonly _: { readonly typesqlType: T } } {
	void type;
	return builder as B & { readonly _: { readonly typesqlType: T } };
}

export const sqliteType: typeof pgType = pgType;
