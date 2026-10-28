import { expectTypeOf, test } from "vitest";
import type {
	IdTok,
	Lex,
	NumTok,
	OpTok,
	ParamTok,
	StrTok,
	WordTok,
} from "../../../src/engine/index.js";
import type { SqlError } from "../../../src/index.js";
import type { Row, V } from "../_schema.js";

/** A bit string's token: a string token marked `bits`. */
type BitTok<V extends string> = StrTok<V> & { readonly bits: true };

/** Token values only, for compact assertions. */
type Vals<Q extends string> =
	Lex<Q> extends infer T
		? T extends readonly unknown[]
			? { [K in keyof T]: T[K] extends { readonly v: infer V } ? V : never }
			: T
		: never;

test('words fold to lowercase; quoted identifiers keep case and unescape ""', () => {
	expectTypeOf<Lex<'SELECT Foo, "Bar", "a""b"'>>().toEqualTypeOf<
		[
			WordTok<"select">,
			WordTok<"foo">,
			OpTok<",">,
			IdTok<"Bar">,
			OpTok<",">,
			IdTok<'a"b'>,
		]
	>();
	// non-ASCII identifier characters are accepted; only ASCII letters fold
	expectTypeOf<Vals<"SELECT Café, naïve, CafÉ">>().toEqualTypeOf<
		["select", "café", ",", "naïve", ",", "cafÉ"]
	>();
});

test("string literals: '' escapes, E'' (escapes kept raw), B'' / X'', dollar quoting", () => {
	expectTypeOf<Lex<"SELECT 'it''s'">>().toEqualTypeOf<
		[WordTok<"select">, StrTok<"it's">]
	>();
	expectTypeOf<Lex<"SELECT E'a\\'b'">>().toEqualTypeOf<
		[WordTok<"select">, StrTok<"a\\'b">]
	>();
	expectTypeOf<Lex<"SELECT X'1F', B'101'">>().toEqualTypeOf<
		[WordTok<"select">, BitTok<"1F">, OpTok<",">, BitTok<"101">]
	>();
	// their digits are checked, as Postgres's bit input does
	expectTypeOf<V<"SELECT B'102'">>().toEqualTypeOf<
		SqlError<'"2" is not a valid binary digit', 1>
	>();
	expectTypeOf<V<"SELECT 1, X'1g'">>().toEqualTypeOf<
		SqlError<'"g" is not a valid hexadecimal digit', 3>
	>();
	expectTypeOf<
		V<"SELECT B'', X'09afAF'">
	>().toEqualTypeOf<"SELECT B'', X'09afAF'">();
	// a word before `&` that is not U&'' / U&""
	expectTypeOf<Vals<"SELECT u&1, a&b, a&'x', b&\"y\"">>().toEqualTypeOf<
		[
			"select",
			"u",
			"&",
			"1",
			",",
			"a",
			"&",
			"b",
			",",
			"a",
			"&",
			"x",
			",",
			"b",
			"&",
			"y",
		]
	>();
	// non-ASCII letters are identifier characters; only ASCII letters fold
	expectTypeOf<Row<"SELECT 1 AS ÉTÉ, 2 AS café">>().toEqualTypeOf<{
		ÉtÉ: number;
		café: number;
	}>();
	// N'…' is NCHAR '…' (a character literal); another letter before a quote is a word
	expectTypeOf<Lex<"SELECT N'abc', ux'a'">>().toEqualTypeOf<
		[
			WordTok<"select">,
			WordTok<"nchar">,
			StrTok<"abc">,
			OpTok<",">,
			WordTok<"ux">,
			StrTok<"a">,
		]
	>();
	expectTypeOf<Row<"SELECT N'abc' AS a">>().toEqualTypeOf<{ a: string }>();
	expectTypeOf<Lex<"SELECT n'a', t'b'">>().toEqualTypeOf<
		[
			WordTok<"select">,
			WordTok<"nchar">,
			StrTok<"a">,
			OpTok<",">,
			WordTok<"t">,
			StrTok<"b">,
		]
	>();
	expectTypeOf<Lex<"SELECT $$it's $1$$, $fn$ a $$ b $fn$">>().toEqualTypeOf<
		[WordTok<"select">, StrTok<"it's $1">, OpTok<",">, StrTok<" a $$ b ">]
	>();
});

test("numbers", () => {
	expectTypeOf<
		Vals<"SELECT 1, 1.5, .5, 1., 1e3, 2.5E-2, 0x1F, 1_000">
	>().toEqualTypeOf<
		[
			"select",
			"1",
			",",
			"1.5",
			",",
			".5",
			",",
			"1.",
			",",
			"1e3",
			",",
			"2.5E-2",
			",",
			"0x1F",
			",",
			"1_000",
		]
	>();
	expectTypeOf<Lex<"SELECT 42">>().toEqualTypeOf<
		[WordTok<"select">, NumTok<"42">]
	>();
});

test("parameters $1..$99", () => {
	expectTypeOf<Lex<"SELECT $1, $10, $99">>().toEqualTypeOf<
		[
			WordTok<"select">,
			ParamTok<1>,
			OpTok<",">,
			ParamTok<10>,
			OpTok<",">,
			ParamTok<99>,
		]
	>();
});

test("operators use longest match", () => {
	expectTypeOf<
		Vals<"a::int ->> b #>> c !~* d <> e != f || g @> h <@ i ?| j ?& k @? l #- m <= n >= o">
	>().toEqualTypeOf<
		[
			"a",
			"::",
			"int",
			"->>",
			"b",
			"#>>",
			"c",
			"!~*",
			"d",
			"<>",
			"e",
			"!=",
			"f",
			"||",
			"g",
			"@>",
			"h",
			"<@",
			"i",
			"?|",
			"j",
			"?&",
			"k",
			"@?",
			"l",
			"#-",
			"m",
			"<=",
			"n",
			">=",
			"o",
		]
	>();
	expectTypeOf<Vals<"a->b">>().toEqualTypeOf<["a", "->", "b"]>();
	// fast paths: punctuation without lookahead, `=` / `:` / `.` with one character of lookahead
	expectTypeOf<Vals<"f(a,b);x[1]+-y*z%2^3">>().toEqualTypeOf<
		[
			"f",
			"(",
			"a",
			",",
			"b",
			")",
			";",
			"x",
			"[",
			"1",
			"]",
			"+",
			"-",
			"y",
			"*",
			"z",
			"%",
			"2",
			"^",
			"3",
		]
	>();
	expectTypeOf<Vals<"a=b c=>d e:=f g::h :i j:k">>().toEqualTypeOf<
		[
			"a",
			"=",
			"b",
			"c",
			"=>",
			"d",
			"e",
			":=",
			"f",
			"g",
			"::",
			"h",
			":",
			"i",
			"j",
			":",
			"k",
		]
	>();
	expectTypeOf<Vals<"t.c .5 t.*">>().toEqualTypeOf<
		["t", ".", "c", ".5", "t", ".", "*"]
	>();
	// a word starting with e / b / x is only a string prefix when a quote follows
	expectTypeOf<Lex<"e x'1' ex b'0' bx E''">>().toEqualTypeOf<
		[
			WordTok<"e">,
			BitTok<"1">,
			WordTok<"ex">,
			BitTok<"0">,
			WordTok<"bx">,
			StrTok<"">,
		]
	>();
});

test("operators follow Postgres's rules: any run of operator characters, trailing + / - split off", () => {
	// user-defined and geometric operators are single tokens
	expectTypeOf<
		Vals<"a *= b ~<~ c |>> d <<| e &<| f @-@ g !=- h">
	>().toEqualTypeOf<
		[
			"a",
			"*=",
			"b",
			"~<~",
			"c",
			"|>>",
			"d",
			"<<|",
			"e",
			"&<|",
			"f",
			"@-@",
			"g",
			"!=-",
			"h",
		]
	>();
	// a trailing + / - is a separate token unless the operator has one of ~ ! @ # ^ & | ` ? %
	expectTypeOf<Vals<"a+-b c*-1 d<-e f@-g">>().toEqualTypeOf<
		["a", "+", "-", "b", "c", "*", "-", "1", "d", "<", "-", "e", "f", "@-", "g"]
	>();
	expectTypeOf<
		Vals<"1 ~- 1 !- 1 @- 1 #- 1 ^- 1 &- 1 |- 1 `- 1 ?- 1 %- 1 @` 1">
	>().toEqualTypeOf<
		[
			"1",
			"~-",
			"1",
			"!-",
			"1",
			"@-",
			"1",
			"#-",
			"1",
			"^-",
			"1",
			"&-",
			"1",
			"|-",
			"1",
			"`-",
			"1",
			"?-",
			"1",
			"%-",
			"1",
			"@`",
			"1",
		]
	>();
	// comments end an operator
	expectTypeOf<Vals<"a+--c\nb */*x*/ c">>().toEqualTypeOf<
		["a", "+", "b", "*", "c"]
	>();
	expectTypeOf<Vals<"a @--c\nb">>().toEqualTypeOf<["a", "@", "b"]>();
	// at the end of input; `/` not followed by `*`
	expectTypeOf<Vals<"a @@">>().toEqualTypeOf<["a", "@@"]>();
	expectTypeOf<Vals<"a /= b">>().toEqualTypeOf<["a", "/=", "b"]>();
	// trailing + / - is dropped again and again (`++` is two operators)
	expectTypeOf<Vals<"a *+b c @+d e ++f g -+h">>().toEqualTypeOf<
		["a", "*", "+", "b", "c", "@+", "d", "e", "+", "+", "f", "g", "-", "+", "h"]
	>();
});

test("whitespace is space, tab, newline, carriage return, form feed and vertical tab", () => {
	expectTypeOf<Vals<"SELECT\t1\r,\f2\v,\n3 , 4">>().toEqualTypeOf<
		["select", "1", ",", "2", ",", "3", ",", "4"]
	>();
	expectTypeOf<Row<"SELECT\t1\rAS\fa,\v2\nAS b">>().toEqualTypeOf<{
		a: number;
		b: number;
	}>();
});

test("comments are skipped, including nested block comments", () => {
	expectTypeOf<
		Vals<"SELECT 1 -- trailing\n, 2 /* block */ , /* outer /* inner */ still comment */ 3">
	>().toEqualTypeOf<["select", "1", ",", "2", ",", "3"]>();
	expectTypeOf<Vals<"SELECT 1 -- no newline at the end">>().toEqualTypeOf<
		["select", "1"]
	>();
});

test("lexer errors carry the index of the token that could not be produced", () => {
	// Postgres names the rest of the input from the opening quote
	expectTypeOf<Lex<"SELECT 'abc">>().toEqualTypeOf<
		SqlError<`unterminated quoted string at or near "'abc"`, 1>
	>();
	expectTypeOf<Lex<'SELECT "abc'>>().toEqualTypeOf<
		SqlError<'unterminated quoted identifier at or near ""abc"', 1>
	>();
	expectTypeOf<Lex<"SELECT 1 /* open">>().toEqualTypeOf<
		SqlError<'unterminated /* comment at or near "/* open"', 2>
	>();
	expectTypeOf<Lex<"SELECT 1 /* a /* b */">>().toEqualTypeOf<
		SqlError<'unterminated /* comment at or near "/* a /* b */"', 2>
	>();
	expectTypeOf<Lex<"SELECT $$abc">>().toEqualTypeOf<
		SqlError<'unterminated dollar-quoted string at or near "$$abc"', 1>
	>();
	expectTypeOf<Lex<"SELECT E'abc">>().toEqualTypeOf<
		SqlError<`unterminated quoted string at or near "E'abc"`, 1>
	>();
	expectTypeOf<Lex<"SELECT b'101">>().toEqualTypeOf<
		SqlError<`unterminated bit string literal at or near "b'101"`, 1>
	>();
	expectTypeOf<Lex<"SELECT x'1F">>().toEqualTypeOf<
		SqlError<`unterminated hexadecimal string literal at or near "x'1F"`, 1>
	>();
	expectTypeOf<Lex<"SELECT U&'abc">>().toEqualTypeOf<
		SqlError<`unterminated quoted string at or near "U&'abc"`, 1>
	>();
	expectTypeOf<Lex<'SELECT 1 AS U&"abc'>>().toEqualTypeOf<
		SqlError<'unterminated quoted identifier at or near "U&"abc"', 3>
	>();
	expectTypeOf<Lex<'SELECT 1 AS U&""'>>().toEqualTypeOf<
		SqlError<'zero-length delimited identifier at or near "U&"""', 3>
	>();
	expectTypeOf<Lex<'SELECT 1 AS U&"\\db99"'>>().toEqualTypeOf<
		SqlError<"invalid Unicode surrogate pair", 3>
	>();
	// a character no token starts with
	expectTypeOf<Lex<"SELECT \\">>().toEqualTypeOf<
		SqlError<'syntax error at or near "\\"', 1>
	>();
	expectTypeOf<Lex<"SELECT {">>().toEqualTypeOf<
		SqlError<'syntax error at or near "{"', 1>
	>();
	// a dollar tag starts like an identifier, and ends with `$`
	expectTypeOf<Lex<"SELECT $+$ x $+$">>().toEqualTypeOf<
		SqlError<'syntax error at or near "$"', 1>
	>();
	expectTypeOf<Lex<"SELECT $x">>().toEqualTypeOf<
		SqlError<'syntax error at or near "$"', 1>
	>();
});

test("string literals: continuation across newlines, E'' backslash parity, U&'' / U&\"\" with UESCAPE", () => {
	// adjacent literals separated by whitespace with a newline are one literal; on one line they are two tokens
	expectTypeOf<Vals<"SELECT 'a'\n  'b'\n'c', 'x' 'y'">>().toEqualTypeOf<
		["select", "abc", ",", "x", "y"]
	>();
	// `\\` before the closing quote is an escaped backslash, not an escaped quote
	expectTypeOf<Vals<"SELECT E'\\\\', e'a\\'b'">>().toEqualTypeOf<
		["select", "\\\\", ",", "a\\'b"]
	>();
	// in an E'' string a doubled quote is a quote too, and continuation lines join
	expectTypeOf<Vals<"SELECT E'it''s', E'a'\n  'b'">>().toEqualTypeOf<
		["select", "it's", ",", "ab"]
	>();
	// U& identifiers are decoded (ASCII / Latin-1 code points); U& string values stay raw
	expectTypeOf<
		Vals<"SELECT U&'d\\0061t' AS U&\"d\\0061t\\+000061\"">
	>().toEqualTypeOf<["select", "d\\0061t", "as", "data"]>();
	// u& in lowercase too
	expectTypeOf<Vals<"SELECT u&'\\0061' AS u&\"d\\0061t\"">>().toEqualTypeOf<
		["select", "\\0061", "as", "dat"]
	>();
	expectTypeOf<
		Vals<"SELECT 1 AS U&\"d*0061t\\+000061\" UESCAPE '*'">
	>().toEqualTypeOf<["select", "1", "as", "dat\\+000061"]>();
	expectTypeOf<Row<'SELECT 1 AS U&"\\00E4"'>>().toEqualTypeOf<{
		"\u00e4": number;
	}>();
	// A doubled escape is decoded; escapes outside Latin-1 stay raw in the lexer.
	expectTypeOf<Row<'SELECT 1 AS U&"a\\\\b"'>>().toEqualTypeOf<{
		"a\\b": number;
	}>();
	expectTypeOf<Vals<'U&"\\01E4"'>>().toEqualTypeOf<["\\01E4"]>();
});

test("Unicode escapes are validated like Postgres", () => {
	expectTypeOf<Lex<"SELECT U&'\\061'">>().toEqualTypeOf<
		SqlError<"invalid Unicode escape", 1>
	>();
	expectTypeOf<Lex<"SELECT U&'\\db99'">>().toEqualTypeOf<
		SqlError<"invalid Unicode surrogate pair", 1>
	>();
	expectTypeOf<Lex<"SELECT U&'\\+2FFFFF'">>().toEqualTypeOf<
		SqlError<"invalid Unicode escape value", 1>
	>();
	expectTypeOf<Lex<"SELECT E'\\udb99\\udc00 ok', E'\\u061'">>().toEqualTypeOf<
		SqlError<"invalid Unicode escape", 3>
	>();
	// every escape is checked, after a valid one or another backslash escape too
	expectTypeOf<Lex<"SELECT E'\\U0061'">>().toEqualTypeOf<
		SqlError<"invalid Unicode escape", 1>
	>();
	expectTypeOf<Lex<"SELECT E'a\\nb\\u061'">>().toEqualTypeOf<
		SqlError<"invalid Unicode escape", 1>
	>();
	expectTypeOf<Lex<"SELECT U&'\\+12'">>().toEqualTypeOf<
		SqlError<"invalid Unicode escape", 1>
	>();
	expectTypeOf<Lex<"SELECT E'\\udb99\\U12'">>().toEqualTypeOf<
		SqlError<"invalid Unicode escape", 1>
	>();
	expectTypeOf<Lex<"SELECT U&'\\0061\\db99'">>().toEqualTypeOf<
		SqlError<"invalid Unicode surrogate pair", 1>
	>();
	expectTypeOf<Lex<"SELECT U&'\\db99x'">>().toEqualTypeOf<
		SqlError<"invalid Unicode surrogate pair", 1>
	>();
	expectTypeOf<Lex<"SELECT E'\\u0000'">>().toEqualTypeOf<
		SqlError<'invalid Unicode escape value at or near "\\u0000"', 1>
	>();
	expectTypeOf<Lex<"SELECT E'\\U12345678'">>().toEqualTypeOf<
		SqlError<'invalid Unicode escape value at or near "\\U12345678"', 1>
	>();
	// a doubled escape character, surrogate pairs written with \\U, \\+ or in U& strings
	type Lexes<Q extends string> =
		Lex<Q> extends readonly unknown[] ? true : Lex<Q>;
	expectTypeOf<
		[
			Lexes<"SELECT U&'a\\\\b'">,
			Lexes<"SELECT U&'\\db99\\dc00'">,
			Lexes<"SELECT E'\\udb99\\U0000dc00'">,
			Lexes<"SELECT U&'\\+00db99\\+00dc00'">,
			Lexes<"SELECT U&'a!!b' UESCAPE '!'">,
		]
	>().toEqualTypeOf<[true, true, true, true, true]>();
	// in an E'' string Postgres points at the escape, or at what follows a high surrogate
	expectTypeOf<Lex<"SELECT E'\\udc99'">>().toEqualTypeOf<
		SqlError<'invalid Unicode surrogate pair at or near "\\udc99"', 1>
	>();
	expectTypeOf<Lex<"SELECT E'\\U00110000'">>().toEqualTypeOf<
		SqlError<'invalid Unicode escape value at or near "\\U00110000"', 1>
	>();
	expectTypeOf<Lex<"SELECT E'\\udb99'">>().toEqualTypeOf<
		SqlError<`invalid Unicode surrogate pair at or near "'"`, 1>
	>();
	expectTypeOf<Lex<"SELECT E'\\udb99x'">>().toEqualTypeOf<
		SqlError<'invalid Unicode surrogate pair at or near "x"', 1>
	>();
	expectTypeOf<Lex<"SELECT E'\\udb99\\u0061'">>().toEqualTypeOf<
		SqlError<'invalid Unicode surrogate pair at or near "\\u0061"', 1>
	>();
	expectTypeOf<Lex<"SELECT E'\\udb99\\U00000061'">>().toEqualTypeOf<
		SqlError<'invalid Unicode surrogate pair at or near "\\U00000061"', 1>
	>();
	expectTypeOf<Lex<"SELECT E'\\udb99\\u00'">>().toEqualTypeOf<
		SqlError<"invalid Unicode escape", 1>
	>();
	expectTypeOf<Lex<"SELECT U&'x' UESCAPE +">>().toEqualTypeOf<
		SqlError<
			'UESCAPE must be followed by a simple string literal at or near "+"',
			1
		>
	>();
	expectTypeOf<Lex<"SELECT U&'x' UESCAPE">>().toEqualTypeOf<
		SqlError<
			"UESCAPE must be followed by a simple string literal at end of input",
			1
		>
	>();
	// a longer word is an alias, not UESCAPE
	expectTypeOf<Row<"SELECT U&'x' uescapes">>().toEqualTypeOf<{
		uescapes: string;
	}>();
	expectTypeOf<Lex<"SELECT U&'x' UESCAPE '+'">>().toEqualTypeOf<
		SqlError<"invalid Unicode escape character at or near \"'+'\"", 1>
	>();
	expectTypeOf<Lex<"SELECT 1 AS U&\"a\" UESCAPE '+'">>().toEqualTypeOf<
		SqlError<"invalid Unicode escape character at or near \"'+'\"", 3>
	>();
	expectTypeOf<Lex<"SELECT U&'x' UESCAPE ''">>().toEqualTypeOf<
		SqlError<"invalid Unicode escape character at or near \"''\"", 1>
	>();
	expectTypeOf<Lex<'SELECT 1 AS ""'>>().toEqualTypeOf<
		SqlError<'zero-length delimited identifier at or near """"', 3>
	>();
});

test("code points: every plane, surrogate ranges, hex digits; UESCAPE only as a word", () => {
	type Lexes<Q extends string> =
		Lex<Q> extends readonly unknown[] ? true : Lex<Q>;
	expectTypeOf<
		[
			Lexes<"SELECT E'\\U00010000'">,
			Lexes<"SELECT E'\\U00020000'">,
			Lexes<"SELECT E'\\U00030000'">,
			Lexes<"SELECT E'\\U00040000'">,
			Lexes<"SELECT E'\\U00050000'">,
			Lexes<"SELECT E'\\U00060000'">,
			Lexes<"SELECT E'\\U00070000'">,
			Lexes<"SELECT E'\\U00080000'">,
			Lexes<"SELECT E'\\U00090000'">,
			Lexes<"SELECT E'\\U000a0000'">,
			Lexes<"SELECT E'\\U000b0000'">,
			Lexes<"SELECT E'\\U000c0000'">,
			Lexes<"SELECT E'\\U000d0000'">,
			Lexes<"SELECT E'\\U000e0000'">,
			Lexes<"SELECT E'\\U000f0000'">,
			Lexes<"SELECT E'\\U00100000'">,
			Lexes<"SELECT E'\\ud800\\udc00'">,
			Lexes<"SELECT E'\\ud9ff\\udfff'">,
			Lexes<"SELECT E'\\uda00\\udd00'">,
			Lexes<"SELECT E'\\udb00\\ude00'">,
			Lexes<"SELECT E'\\ud7ff'">,
			Lexes<"SELECT U&'x' uescapes">,
			Lexes<"SELECT U&'x' uescapeé">,
			Lexes<"SELECT U&'x' uescape1">,
			Lexes<"SELECT U&'x!0061' UESCAPE'!'">,
		]
	>().toEqualTypeOf<
		[
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			true,
		]
	>();
	expectTypeOf<Lex<"SELECT E'\\u12zz'">>().toEqualTypeOf<
		SqlError<"invalid Unicode escape", 1>
	>();
	expectTypeOf<Lex<"SELECT U&'\\+12zz34'">>().toEqualTypeOf<
		SqlError<"invalid Unicode escape", 1>
	>();
	expectTypeOf<Lex<"SELECT E'\\U00zz0000'">>().toEqualTypeOf<
		SqlError<"invalid Unicode escape", 1>
	>();
	expectTypeOf<Lex<"SELECT U&'x' UESCAPE '!!'">>().toEqualTypeOf<
		SqlError<`invalid Unicode escape character at or near "'!!'"`, 1>
	>();
	// too few hex digits, or a non-hex digit first
	expectTypeOf<
		[
			Lex<"SELECT U&'\\+1'">,
			Lex<"SELECT U&'\\+zz1234'">,
			Lex<"SELECT E'\\U1'">,
			Lex<"SELECT E'\\Uzz123456'">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"invalid Unicode escape", 1>,
			SqlError<"invalid Unicode escape", 1>,
			SqlError<"invalid Unicode escape", 1>,
			SqlError<"invalid Unicode escape", 1>,
		]
	>();
	// eight digits above 10FFFF, even when the first two are 01..10
	expectTypeOf<Lex<"SELECT E'\\U01000000'">>().toEqualTypeOf<
		SqlError<'invalid Unicode escape value at or near "\\U01000000"', 1>
	>();
	// the escapes after a valid one, or after a surrogate pair, are checked too
	expectTypeOf<
		[
			Lex<"SELECT E'\\u0061\\u061'">,
			Lex<"SELECT E'\\udb99\\udc00\\u061'">,
			Lex<"SELECT U&'\\db99\\dc00\\061'">,
			Lex<"SELECT U&'\\db99\\+00dc00\\061'">,
		]
	>().toEqualTypeOf<
		[
			SqlError<"invalid Unicode escape", 1>,
			SqlError<"invalid Unicode escape", 1>,
			SqlError<"invalid Unicode escape", 1>,
			SqlError<"invalid Unicode escape", 1>,
		]
	>();
});

test("numbers: digit separators, radix prefixes and trailing junk follow Postgres 16+", () => {
	expectTypeOf<
		Vals<"SELECT 0x_42F, 0b101, 0o17, 1_000.5e1, 12.e-3, 1..2">
	>().toEqualTypeOf<
		[
			"select",
			"0x_42F",
			",",
			"0b101",
			",",
			"0o17",
			",",
			"1_000.5e1",
			",",
			"12.e-3",
			",",
			"1",
			".",
			".2",
		]
	>();
	// the junk is the number and the identifier characters after it, as Postgres reports it
	expectTypeOf<Lex<"SELECT 123abc">>().toEqualTypeOf<
		SqlError<'trailing junk after numeric literal at or near "123abc"', 1>
	>();
	expectTypeOf<Lex<"SELECT 100__000">>().toEqualTypeOf<
		SqlError<'trailing junk after numeric literal at or near "100__000"', 1>
	>();
	expectTypeOf<Lex<"SELECT 1_000._5, 1é">>().toEqualTypeOf<
		SqlError<'trailing junk after numeric literal at or near "1_000._5"', 1>
	>();
	expectTypeOf<Lex<"SELECT 1_000.5e_1">>().toEqualTypeOf<
		SqlError<'trailing junk after numeric literal at or near "1_000.5e_1"', 1>
	>();
	expectTypeOf<Lex<"SELECT 1é">>().toEqualTypeOf<
		SqlError<'trailing junk after numeric literal at or near "1é"', 1>
	>();
	expectTypeOf<Lex<"SELECT 0.0e+a">>().toEqualTypeOf<
		SqlError<'trailing junk after numeric literal at or near "0.0e+"', 1>
	>();
	expectTypeOf<Lex<"SELECT 0x">>().toEqualTypeOf<
		SqlError<'invalid hexadecimal integer at or near "0x"', 1>
	>();
	expectTypeOf<Lex<"SELECT 0x_">>().toEqualTypeOf<
		SqlError<'invalid hexadecimal integer at or near "0x_"', 1>
	>();
	expectTypeOf<Lex<"SELECT 1e, 2">>().toEqualTypeOf<
		SqlError<'trailing junk after numeric literal at or near "1e"', 1>
	>();
	// after 0x / 0o / 0b, `0` and the identifier after it are the junk: a digit of another radix too
	type Junk<N extends string> = SqlError<
		`trailing junk after numeric literal at or near "${N}"`,
		1
	>;
	expectTypeOf<
		[
			Lex<"SELECT 0o19">,
			Lex<"SELECT 0b12">,
			Lex<"SELECT 0o8">,
			Lex<"SELECT 0b2">,
			Lex<"SELECT 0xg">,
			Lex<"SELECT 0x_g">,
			Lex<"SELECT 0x1_g">,
			Lex<"SELECT 0x1_">,
			Lex<"SELECT 0x1$">,
			Lex<"SELECT 0x1é">,
		]
	>().toEqualTypeOf<
		[
			Junk<"0o19">,
			Junk<"0b12">,
			Junk<"0o8">,
			Junk<"0b2">,
			Junk<"0xg">,
			Junk<"0x_g">,
			Junk<"0x1_g">,
			Junk<"0x1_">,
			Junk<"0x1$">,
			Junk<"0x1é">,
		]
	>();
	expectTypeOf<Vals<"SELECT 0o_7, 0O1234567, 0X1F, 0x1.5">>().toEqualTypeOf<
		["select", "0o_7", ",", "0O1234567", ",", "0X1F", ",", "0x1", ".5"]
	>();
	expectTypeOf<Lex<"SELECT $1a">>().toEqualTypeOf<
		SqlError<'trailing junk after parameter at or near "$1a"', 1>
	>();
	expectTypeOf<Lex<"SELECT $0_1">>().toEqualTypeOf<
		SqlError<'trailing junk after parameter at or near "$0_1"', 1>
	>();
	// digit separators do not count towards the int4 / int8 / numeric choice; very long literals are numeric
	type D1200 =
		`${"1234567890123456789012345678901234567890"}${"1234567890123456789012345678901234567890"}`;
	type Long =
		`${D1200}${D1200}${D1200}${D1200}${D1200}${D1200}${D1200}${D1200}${D1200}${D1200}${D1200}${D1200}${D1200}${D1200}${D1200}`;
	expectTypeOf<Row<`SELECT 1_000_000_000 AS a, ${Long} AS b`>>().toEqualTypeOf<{
		a: number;
		b: string;
	}>();
});

test("lexing feeds the engine end to end", () => {
	expectTypeOf<
		Row<'SELECT "id" AS "Id", label AS "Label" FROM things'>
	>().toEqualTypeOf<{ Id: number; Label: string }>();
	expectTypeOf<
		V<"SELECT id FROM things WHERE label = 'a''b' -- comment">
	>().toEqualTypeOf<"SELECT id FROM things WHERE label = 'a''b' -- comment">();
});

test("long runs of whitespace are lexed in chunks too", () => {
	type S10 = "          ";
	type S100 = `${S10}${S10}${S10}${S10}${S10}${S10}${S10}${S10}${S10}${S10}`;
	type S1000 =
		`${S100}${S100}${S100}${S100}${S100}${S100}${S100}${S100}${S100}${S100}`;
	expectTypeOf<Vals<`SELECT${S1000}${S1000}\n${S1000} 1`>>().toEqualTypeOf<
		["select", "1"]
	>();
});

test("long statements are lexed in chunks (4 KB, > 1000 tokens)", () => {
	type Q8 =
		"SELECT id, label, id + 1 AS a, label || 'x' AS b FROM things WHERE id > 0 AND label <> 'zzz' ";
	type Q64 = `${Q8}${Q8}${Q8}${Q8}${Q8}${Q8}${Q8}${Q8}`;
	type Big = `${Q64}${Q64}${Q64}${Q64}${Q64}${Q64}`;
	expectTypeOf<Lex<Big>["length"]>().toEqualTypeOf<1248>();
});

test("line token sharing keeps multiline tokens and lexical lookahead intact", () => {
	expectTypeOf<Vals<"SELECT -- ignored, comma\n1">>().toEqualTypeOf<
		["select", "1"]
	>();
	expectTypeOf<
		Vals<"SELECT\n 1, -- ignored, also skipped\n 2 /* outer\n /* nested */ done */\n">
	>().toEqualTypeOf<["select", "1", ",", "2"]>();
	expectTypeOf<
		Vals<"SELECT 'first\nsecond', \"multi\nline\", $tag$body\ntext$tag$">
	>().toEqualTypeOf<
		["select", "first\nsecond", ",", "multi\nline", ",", "body\ntext"]
	>();
	expectTypeOf<Vals<"SELECT 'a'\n \t'b', E'c'\n'd'">>().toEqualTypeOf<
		["select", "ab", ",", "cd"]
	>();
	expectTypeOf<Vals<"SELECT U&\"d!0061t\"\n UESCAPE '!'">>().toEqualTypeOf<
		["select", "dat"]
	>();
	expectTypeOf<Vals<"SELECT u&'!0061'\n uescape '!'">>().toEqualTypeOf<
		["select", "!0061"]
	>();
	expectTypeOf<Vals<"SELECT U&'!0061'\n UESCAPE '!'">>().toEqualTypeOf<
		["select", "!0061"]
	>();
	expectTypeOf<Lex<"SELECT\n 1, 'unterminated\n rest">>().toEqualTypeOf<
		SqlError<'unterminated quoted string at or near "\'unterminated\n rest"', 3>
	>();
});

test("line sharing bounds its own recursion before using the chunked scanner", () => {
	type W100 =
		"abcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghij";
	type W1000 =
		`${W100}${W100}${W100}${W100}${W100}${W100}${W100}${W100}${W100}${W100}`;
	type LongWord = `${W1000}${W100}${W100}`;
	expectTypeOf<Lex<`SELECT ${LongWord}`>>().toEqualTypeOf<
		[WordTok<"select">, WordTok<LongWord>]
	>();
	type S10 = "          ";
	type S100 = `${S10}${S10}${S10}${S10}${S10}${S10}${S10}${S10}${S10}${S10}`;
	type S1000 =
		`${S100}${S100}${S100}${S100}${S100}${S100}${S100}${S100}${S100}${S100}`;
	expectTypeOf<Vals<`SELECT 'a'\n${S1000}${S1000} + 1`>>().toEqualTypeOf<
		["select", "a", "+", "1"]
	>();
	type C10 = ",,,,,,,,,,";
	type C100 = `${C10}${C10}${C10}${C10}${C10}${C10}${C10}${C10}${C10}${C10}`;
	type C1000 =
		`${C100}${C100}${C100}${C100}${C100}${C100}${C100}${C100}${C100}${C100}`;
	expectTypeOf<Lex<`${C1000}${C1000}`>["length"]>().toEqualTypeOf<2000>();
	type L10 = "\n\n\n\n\n\n\n\n\n\n";
	type L100 = `${L10}${L10}${L10}${L10}${L10}${L10}${L10}${L10}${L10}${L10}`;
	type L1000 =
		`${L100}${L100}${L100}${L100}${L100}${L100}${L100}${L100}${L100}${L100}`;
	expectTypeOf<Vals<`SELECT${L1000}${L1000}1`>>().toEqualTypeOf<
		["select", "1"]
	>();
	expectTypeOf<Vals<`SELECT 'a'${L100}${L100}${L100}'b'`>>().toEqualTypeOf<
		["select", "ab"]
	>();
});
