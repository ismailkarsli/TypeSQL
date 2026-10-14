/**
 * Pin the Postgres type of a Drizzle column for `FromDrizzle`, where the column type alone
 * cannot tell it: `pgType(timestamp("at", { withTimezone: true }), "timestamptz")`, or a
 * `customType` column. Returns the builder unchanged at runtime.
 */
export function pgType<B, const T extends string>(builder: B, type: T): B & { readonly _: { readonly typesqlType: T } } {
  void type;
  return builder as B & { readonly _: { readonly typesqlType: T } };
}
