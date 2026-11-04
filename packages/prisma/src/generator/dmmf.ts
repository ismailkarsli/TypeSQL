interface DmmfFieldDefault {
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

// Prisma sends the DMMF as JSON; these guards check the parts typesql reads.

const isString = (value: unknown): value is string => typeof value === "string";

const isBoolean = (value: unknown): value is boolean =>
	typeof value === "boolean";

const isNullableString = (value: unknown): value is string | null =>
	value === null || typeof value === "string";

const isOptionalString = (value: unknown): value is string | null | undefined =>
	value === undefined || isNullableString(value);

const isOptionalText = (value: unknown): value is string | undefined =>
	value === undefined || typeof value === "string";

const isStrings = (value: unknown): value is readonly string[] =>
	Array.isArray(value) && value.every(isString);

const isFieldDefault = (value: unknown): value is DmmfField["default"] =>
	value === undefined ||
	value === null ||
	typeof value === "string" ||
	typeof value === "number" ||
	typeof value === "boolean" ||
	Array.isArray(value) ||
	(typeof value === "object" &&
		"name" in value &&
		typeof value.name === "string" &&
		"args" in value &&
		Array.isArray(value.args));

const isNativeType = (value: unknown): value is DmmfField["nativeType"] =>
	value === undefined ||
	value === null ||
	(Array.isArray(value) &&
		value.length === 2 &&
		isString(value[0]) &&
		isStrings(value[1]));

const isKind = (value: unknown): value is DmmfField["kind"] =>
	value === "scalar" ||
	value === "enum" ||
	value === "object" ||
	value === "unsupported";

const isDmmfField = (value: unknown): value is DmmfField =>
	typeof value === "object" &&
	value !== null &&
	"name" in value &&
	isString(value.name) &&
	(!("dbName" in value) || isOptionalString(value.dbName)) &&
	"kind" in value &&
	isKind(value.kind) &&
	"type" in value &&
	isString(value.type) &&
	"isList" in value &&
	isBoolean(value.isList) &&
	"isRequired" in value &&
	isBoolean(value.isRequired) &&
	"hasDefaultValue" in value &&
	isBoolean(value.hasDefaultValue) &&
	(!("default" in value) || isFieldDefault(value.default)) &&
	(!("isUpdatedAt" in value) ||
		value.isUpdatedAt === undefined ||
		isBoolean(value.isUpdatedAt)) &&
	(!("nativeType" in value) || isNativeType(value.nativeType)) &&
	(!("documentation" in value) || isOptionalText(value.documentation));

const isDmmfModel = (value: unknown): value is DmmfModel =>
	typeof value === "object" &&
	value !== null &&
	"name" in value &&
	isString(value.name) &&
	"dbName" in value &&
	isNullableString(value.dbName) &&
	(!("schema" in value) || isOptionalString(value.schema)) &&
	"fields" in value &&
	Array.isArray(value.fields) &&
	value.fields.every(isDmmfField) &&
	(!("documentation" in value) || isOptionalText(value.documentation));

const isDmmfEnumValue = (value: unknown): value is DmmfEnum["values"][number] =>
	typeof value === "object" &&
	value !== null &&
	"name" in value &&
	isString(value.name) &&
	"dbName" in value &&
	isNullableString(value.dbName);

const isDmmfEnum = (value: unknown): value is DmmfEnum =>
	typeof value === "object" &&
	value !== null &&
	"name" in value &&
	isString(value.name) &&
	(!("dbName" in value) || isOptionalString(value.dbName)) &&
	"values" in value &&
	Array.isArray(value.values) &&
	value.values.every(isDmmfEnumValue);

export const isDmmfDatamodel = (value: unknown): value is DmmfDatamodel =>
	typeof value === "object" &&
	value !== null &&
	"models" in value &&
	Array.isArray(value.models) &&
	value.models.every(isDmmfModel) &&
	"enums" in value &&
	Array.isArray(value.enums) &&
	value.enums.every(isDmmfEnum);
