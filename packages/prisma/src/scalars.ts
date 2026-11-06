// The column type of each Prisma scalar with no native type, per database:
// what the generator writes and what FromPrisma types a model with.

export const PRISMA_SCALARS = {
	postgres: {
		Int: "int4",
		BigInt: "int8",
		Float: "float8",
		Decimal: "numeric",
		String: "text",
		Boolean: "bool",
		DateTime: "timestamp",
		Json: "jsonb",
		Bytes: "bytea",
	},
	sqlite: {
		Int: "integer",
		BigInt: "bigint",
		Float: "real",
		Decimal: "decimal",
		String: "text",
		Boolean: "boolean",
		DateTime: "datetime",
		Json: "jsonb",
		Bytes: "blob",
	},
	// Native types (`@db.Text`, …) need an override.
	mysql: {
		Int: "int",
		BigInt: "bigint",
		Float: "double",
		Decimal: "decimal",
		String: "varchar",
		Boolean: "tinyint",
		DateTime: "datetime",
		Json: "json",
		Bytes: "longblob",
	},
} as const satisfies Readonly<
	Record<"postgres" | "sqlite" | "mysql", Readonly<Record<string, string>>>
>;
