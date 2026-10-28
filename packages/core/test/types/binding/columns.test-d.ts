import { expectTypeOf, test } from "vitest";
import type {
	Arr,
	Col,
	Generated,
	Nullable,
	NullableGenerated,
} from "../../../src/index.js";

test("column helpers are plain descriptors", () => {
	expectTypeOf<
		[
			Col<"int4">,
			Nullable<"text">,
			Generated<"int8">,
			NullableGenerated<"text[]">,
			Arr<"int4", { nullable: true }>,
		]
	>().toEqualTypeOf<
		[
			{
				readonly type: "int4";
				readonly nullable: false;
				readonly hasDefault: false;
			},
			{
				readonly type: "text";
				readonly nullable: true;
				readonly hasDefault: false;
			},
			{
				readonly type: "int8";
				readonly nullable: false;
				readonly hasDefault: true;
			},
			{
				readonly type: "text[]";
				readonly nullable: true;
				readonly hasDefault: true;
			},
			{
				readonly type: "int4[]";
				readonly nullable: true;
				readonly hasDefault: false;
			},
		]
	>();
});
