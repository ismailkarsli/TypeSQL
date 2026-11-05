export function pgType<B, const T extends string>(
	builder: B,
	type: T,
): B & { readonly _: { readonly typesqlType: T } };
// The column type is a phantom: only the overload above carries it.
export function pgType<B>(builder: B, type: string): B {
	void type;
	return builder;
}

export const sqliteType: typeof pgType = pgType;

export const mysqlType: typeof pgType = pgType;
