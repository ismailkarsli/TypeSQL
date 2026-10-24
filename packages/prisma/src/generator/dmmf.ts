/**
 * The subset of Prisma's DMMF (`options.dmmf.datamodel` in a generator's `generate` request)
 * the generator reads. Declared here so the package needs no `@prisma/generator-helper`.
 */

export interface DmmfFieldDefault {
	readonly name: string;
	readonly args: readonly unknown[];
}

export interface DmmfField {
	readonly name: string;
	/** `@map` name, when set. */
	readonly dbName?: string | null;
	readonly kind: "scalar" | "enum" | "object" | "unsupported";
	readonly type: string;
	readonly isList: boolean;
	readonly isRequired: boolean;
	readonly hasDefaultValue: boolean;
	/** A function default (`{ name: "autoincrement", args: [] }`) or a literal (`"USER"`, `0`, `[]`). */
	readonly default?:
		| DmmfFieldDefault
		| string
		| number
		| boolean
		| readonly unknown[]
		| null;
	readonly isUpdatedAt?: boolean;
	/** `@db.*`: `["VarChar", ["200"]]`. */
	readonly nativeType?: readonly [string, readonly string[]] | null;
	readonly documentation?: string;
}

export interface DmmfModel {
	readonly name: string;
	/** `@@map` name, when set. */
	readonly dbName: string | null;
	/** `@@schema` name (multiSchema), when set. */
	readonly schema?: string | null;
	readonly fields: readonly DmmfField[];
	readonly documentation?: string;
}

export interface DmmfEnum {
	readonly name: string;
	/** `@@map` name, when set. (Enums carry no `@@schema` in the DMMF.) */
	readonly dbName?: string | null;
	readonly values: readonly {
		readonly name: string;
		readonly dbName: string | null;
	}[];
}

export interface DmmfDatamodel {
	readonly models: readonly DmmfModel[];
	readonly enums: readonly DmmfEnum[];
}
