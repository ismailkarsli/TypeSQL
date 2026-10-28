import { expectTypeOf, test } from "vitest";
import type {
	Lex,
	ParseProgram,
	SqlError,
	Validate,
} from "../../src/engine/index.js";
import type { Col, DefaultTypeMap, RowOf } from "../../src/index.js";
import type { DB } from "./_schema.js";

test("a punctuation token after a table qualifier is not a star target", () => {
	expectTypeOf<Validate<DB, "SELECT u.+ FROM users u">>().toEqualTypeOf<
		SqlError<"syntax error at or near +", 3>
	>();
});

test("IS NFC NORMALIZED keeps the value before the normalization form", () => {
	type Parsed = ParseProgram<Lex<"SELECT 'value' IS NFC NORMALIZED">>;
	type Args = Parsed extends {
		body: { targets: [{ e: { args: infer A } }] };
	}
		? A
		: never;
	expectTypeOf<Args>().toEqualTypeOf<
		[{ t: "str"; v: "value" }, { t: "str"; v: "NFC" }]
	>();
});

test("NORMALIZE keeps the value before the normalization form", () => {
	type Parsed = ParseProgram<Lex<"SELECT normalize('value', NFC)">>;
	type Args = Parsed extends { body: { targets: [{ e: { args: infer A } }] } }
		? A
		: never;
	expectTypeOf<Args>().toEqualTypeOf<
		[{ t: "str"; v: "value" }, { t: "str"; v: "NFC" }]
	>();
});

test("function keywords remain column names without an opening parenthesis", () => {
	type Keywords = {
		keyword_columns: {
			exists: Col<"int4">;
			overlay: Col<"text">;
			normalize: Col<"text">;
			xmlelement: Col<"text">;
		};
	};
	expectTypeOf<
		RowOf<
			Keywords,
			DefaultTypeMap,
			"SELECT exists + 1 AS n, overlay || '' AS a, normalize || '' AS b, xmlelement || '' AS c FROM keyword_columns"
		>
	>().toEqualTypeOf<{ n: number; a: string; b: string; c: string }>();
});
