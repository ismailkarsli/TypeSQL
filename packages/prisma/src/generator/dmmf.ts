export interface DmmfFieldDefault {
	readonly name: string;
	readonly args: readonly unknown[];
}

export interface DmmfField {
	readonly name: string;
	readonly dbName?: string | null;
	readonly kind: "scalar" | "enum" | "object" | "unsupported";
	readonly type: string;
	readonly isList: boolean;
	readonly isRequired: boolean;
	readonly hasDefaultValue: boolean;
	readonly default?:
		| DmmfFieldDefault
		| string
		| number
		| boolean
		| readonly unknown[]
		| null;
	readonly isUpdatedAt?: boolean;
	readonly nativeType?: readonly [string, readonly string[]] | null;
	readonly documentation?: string;
}

export interface DmmfModel {
	readonly name: string;
	readonly dbName: string | null;
	readonly schema?: string | null;
	readonly fields: readonly DmmfField[];
	readonly documentation?: string;
}

export interface DmmfEnum {
	readonly name: string;
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
