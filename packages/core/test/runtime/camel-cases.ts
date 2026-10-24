/**
 * `[column name, camelCased key]` pairs shared by the type test (`CamelCase<S>`), the runtime
 * test (`camelCase(s)`) and `@typesql/kysely`'s test against `CamelCasePlugin` itself.
 */
export const camelCases = [
	["", ""],
	["id", "id"],
	["count", "count"],
	["?column?", "?column?"],
	["created_at", "createdAt"],
	["display_name", "displayName"],
	["x_y_z", "xYZ"],
	["address_line_1", "addressLine1"],
	["col_1_2", "col12"],
	["sha256_hash", "sha256Hash"],
	["a_1b", "a1b"],
	["1_a", "1A"],
	["_private", "_Private"],
	["__typename", "_Typename"],
	["_", "_"],
	["__", "_"],
	["_a_b", "_AB"],
	["a__b", "aB"],
	["trailing_", "trailing"],
	["trailing__", "trailing"],
	["HTTP_CODE", "HTTPCODE"],
	["fooBar", "fooBar"],
	["foo_Bar", "fooBar"],
	["user_ID", "userID"],
	["a-b_c", "a-bC"],
	["a b_c", "a bC"],
	["über_größe", "überGröße"],
	["straße_ß", "straßeSS"],
] as const;
