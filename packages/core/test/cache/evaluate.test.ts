import { expect, test } from "vitest";
import { parseTypeText, readAnalysis, type Analysis } from "../../src/cache/evaluate.js";

test("printed types read as data", () => {
  expect(parseTypeText(`{ readonly a: "x"; b: 1; c: -2.5; d: true; e: null; f: ["p", { g: false; }]; }`)).toEqual({ a: "x", b: 1, c: -2.5, d: true, e: null, f: ["p", { g: false }] });
  expect(parseTypeText(`"a" | "b"`)).toEqual({ union: ["a", "b"] });
  expect(parseTypeText(`"jsonb" & { readonly shape: X<1>; }`)).toEqual({ and: ["jsonb", { shape: { ref: "X<1>" } }] });
  expect(parseTypeText(`{ "quoted key": string; f: (x: number) => void; }`)).toEqual({ "quoted key": { ref: "string" }, f: { ref: "(x: number) => void" } });
  expect(parseTypeText(`readonly (string)[]`)).toEqual({ ref: "readonly (string)[]" });
  expect(parseTypeText(`import("x").Y<{ a: 1 }>`)).toEqual({ ref: `import("x").Y<{ a: 1 }>` });
});

test("an analysis: columns, `*` expansions, parameters used in several places, shaped arrays", () => {
  const a = readAnalysis(
    `{ readonly kind: "select"; readonly cols: [{ readonly n: "a"; readonly t: { readonly type: "int4"; readonly nullable: false; }; }, { readonly star: { readonly id: { readonly type: "int8"; readonly nullable: true; }; }; }, { readonly n: "j"; readonly t: { readonly type: \`\${import("../shape").Shaped<"json", { readonly k: "obj"; }>}[]\`; readonly nullable: false; }; }]; readonly params: { readonly 1: { readonly type: "text"; readonly nullable: false; } | { readonly type: "text"; readonly nullable: true; } | { readonly type: "unknown"; readonly nullable: true; readonly nullTest: true; }; }; readonly max: 1; readonly names: ["x"]; }`,
  );
  expect(a).toMatchObject({
    kind: "select",
    cols: [{ name: "a", type: "int4", nullable: false }, { name: "id", type: "int8", nullable: true, star: true }, { name: "j", type: "json[]", nullable: false }],
    params: { 1: { type: "text", nullable: true } },
    max: 1,
    names: ["x"],
  });
  expect(readAnalysis(`{ readonly kind: "update"; readonly cols: null; readonly params: {}; readonly max: 0; readonly names: []; }`)).toEqual({ kind: "update", cols: [], params: {}, max: 0, names: [] });
  expect(readAnalysis(`__T.SqlError<"column \\"x\\" does not exist", 7>`)).toEqual({ error: 'column "x" does not exist', pos: 7 });
  expect(readAnalysis(`__T.SqlError<any, 0>`)).toEqual({ error: "any", pos: 0 });
  expect(readAnalysis(`__T.SqlError<"a" | "b", number>`)).toEqual({ error: '"a" | "b"', pos: null });
  expect(readAnalysis(`__T.SqlError<"x", null>`)).toEqual({ error: "x", pos: null });
  expect(readAnalysis(`__T.SqlError<"x", 12>`)).toEqual({ error: "x", pos: 12 });
});

test("printed types: numbers, words, keywords, templates and strings", () => {
  expect(parseTypeText("12")).toBe(12);
  expect(parseTypeText("1.25")).toBe(1.25);
  expect(parseTypeText("1e+21")).toBe(1e21);
  expect(parseTypeText("1e21")).toBe(1e21);
  expect(parseTypeText("2.5e-3")).toBe(0.0025);
  expect(parseTypeText("10n")).toEqual({ ref: "10n" });
  expect(parseTypeText("A.B.C<x>")).toEqual({ ref: "A.B.C<x>" });
  expect(parseTypeText("__T.SqlError")).toEqual({ ref: "__T.SqlError" });
  expect(parseTypeText("X<a => b>")).toEqual({ ref: "X<a => b>" });
  expect(parseTypeText("import")).toEqual({ ref: "import" });
  expect(parseTypeText(`import("x")`)).toEqual({ ref: `import("x")` });
  expect(parseTypeText(`import("x").Y | 1`)).toEqual({ union: [{ ref: `import("x").Y` }, 1] });
  expect(parseTypeText(`import("x") | 1`)).toEqual({ union: [{ ref: `import("x")` }, 1] });
  expect(parseTypeText(`import("x")<1>`)).toEqual({ ref: `import("x")<1>` });
  expect(parseTypeText(`X<">"> | Y<'>'>`)).toEqual({ union: [{ ref: `X<">">` }, { ref: `Y<'>'>` }] });
  expect(parseTypeText("X<1")).toEqual({ ref: "X<1" });
  expect(parseTypeText("typeof x")).toEqual({ ref: "typeof x" });
  expect(parseTypeText("keyof X")).toEqual({ ref: "keyof X" });
  expect(parseTypeText("unique symbol")).toEqual({ ref: "unique symbol" });
  expect(parseTypeText("{ a: typeof x }")).toEqual({ a: { ref: "typeof x" } });
  expect(parseTypeText("keyof readonly string[] | 1")).toEqual({ union: [{ ref: "keyof readonly string[]" }, 1] });
  expect(parseTypeText("`a${string}b`")).toEqual({ ref: "`a${string}b`" });
  expect(parseTypeText("`a\\`b` | 1")).toEqual({ union: [{ ref: "`a\\`b`" }, 1] });
  expect(parseTypeText(`'it\\'s "q"'`)).toBe(`it's "q"`);
  expect(parseTypeText(`"a\\"b"`)).toBe(`a"b`);
  expect(parseTypeText("'x'")).toBe("x");
  expect(parseTypeText("1 ")).toBe(1);
});

test("printed types: unions, intersections, arrays, readonly, functions", () => {
  expect(parseTypeText(`| "a" | "b"`)).toEqual({ union: ["a", "b"] });
  expect(parseTypeText(`"a" | string[]`)).toEqual({ union: ["a", { ref: "string[]" }] });
  expect(parseTypeText("A & B")).toEqual({ and: [{ ref: "A" }, { ref: "B" }] });
  expect(parseTypeText("{ a: readonly string[] }")).toEqual({ a: { ref: "readonly string[]" } });
  expect(parseTypeText("readonly [1, 2]")).toEqual([1, 2]);
  expect(parseTypeText("{ f: () => void }")).toEqual({ f: { ref: "() => void" } });
  expect(parseTypeText("(1 | 2)")).toEqual({ union: [1, 2] });
});

test("printed types: object members", () => {
  expect(parseTypeText("{ }")).toEqual({});
  expect(parseTypeText("{ a?: 1, b: 2 }")).toEqual({ a: 1, b: 2 });
  expect(parseTypeText("{ 'k': 1; }")).toEqual({ k: 1 });
  expect(parseTypeText("{ [x: string]: 1; }")).toEqual({ "[x: string]": 1 });
  for (const t of ["{ (): void }", "{ new (): X }", "{ <T>(x: T): T }", "{ m(): void }", "{ m<T>(): void }", "{ a: 1; m(): void }"]) expect(parseTypeText(t)).toEqual({ ref: t });
  expect(parseTypeText("{ a: { (): void }; b: 1 }")).toEqual({ a: { ref: "{ (): void }" }, b: 1 });
  expect(parseTypeText("{ a: { m(): void }; b: 1 }")).toEqual({ a: { ref: "{ m(): void }" }, b: 1 });
});

test("printed types: what cannot be read", () => {
  expect(() => parseTypeText("1 2")).toThrow(new Error(`unexpected "2" at 2 in printed type`));
  expect(() => parseTypeText(`1 ${"x".repeat(30)}`)).toThrow(new Error(`unexpected "${"x".repeat(20)}" at 2 in printed type`));
  expect(() => parseTypeText("x(1)")).toThrow(new Error(`unexpected "(1)" at 1 in printed type`));
  expect(() => parseTypeText("A && B")).toThrow(new Error(`unexpected "&& B" at 2 in printed type`));
  expect(() => parseTypeText("(1")).toThrow(new Error(`expected ")" at 2: ""`));
  expect(() => parseTypeText(`{ a 1${" ".repeat(40)}}`)).toThrow(new Error(`expected ":" at 4: "1${" ".repeat(29)}"`));
  expect(() => parseTypeText("%")).toThrow(new Error(`cannot read printed type at 0: "%"`));
  expect(() => parseTypeText(`1 | %${"y".repeat(40)}`)).toThrow(new Error(`cannot read printed type at 4: "%${"y".repeat(29)}"`));
  expect(() => parseTypeText("{ : 1 }")).toThrow(new Error("expected a property name at 2"));
  expect(() => parseTypeText("`abc")).toThrow(new Error(`unexpected "" at 5 in printed type`));
  expect(() => parseTypeText("'abc")).toThrow(new Error(`unexpected "" at 5 in printed type`));
  expect(() => parseTypeText(`"abc`)).toThrow(SyntaxError);
});

const analysis = (fields: string): string => `{ readonly kind: "select"; readonly cols: []; readonly params: {}; readonly max: 0; readonly names: []; ${fields} }`;
const col = (t: string): string => `[{ readonly n: "c"; readonly t: ${t}; }]`;

test("an analysis: errors", () => {
  expect(readAnalysis(`__T.SqlError<"m", 12>`)).toEqual({ error: "m", pos: 12 });
  expect(readAnalysis(`__T.SqlError<"m", null>`)).toEqual({ error: "m", pos: null });
  expect(() => readAnalysis(`__T.SqlError<"m", 1>[]`)).toThrow(new Error(`not an analysis: __T.SqlError<"m", 1>[]`));
  expect(() => readAnalysis(`X | __T.SqlError<"m", 1>`)).toThrow(new Error(`not an analysis: X | __T.SqlError<"m", 1>`));
  const long = Array(80).fill("1").join(" | ");
  expect(() => readAnalysis(long)).toThrow(new Error(`not an analysis: ${long.slice(0, 200)}`));
  expect(() => readAnalysis("[1]")).toThrow(new Error("not an analysis: [1]"));
  expect(() => readAnalysis(`{ a: 1 } | { b: 2 }`)).toThrow(new Error("not an analysis: { a: 1 } | { b: 2 }"));
  expect(() => readAnalysis(`{ a: 1 } & { b: 2 }`)).toThrow(new Error("not an analysis: { a: 1 } & { b: 2 }"));
});

test("an analysis: fields of another shape", () => {
  expect(readAnalysis(`{ readonly kind: 1; readonly cols: [1]; readonly params: null; readonly max: "x"; readonly names: null; }`)).toEqual({
    kind: "1",
    cols: [{ name: "?", type: "?", nullable: true }],
    params: {},
    max: 0,
    names: [],
  });
  expect(readAnalysis(`{ readonly kind: "select"; readonly cols: [{ readonly star: { a: 1 } | { b: 2 }; readonly n: "s"; readonly t: { readonly type: "int4"; readonly nullable: false; }; }]; readonly params: {}; readonly max: 2; readonly names: ["a", "b"]; }`)).toEqual({
    kind: "select",
    cols: [{ name: "s", type: "int4", nullable: false }],
    params: {},
    max: 2,
    names: ["a", "b"],
  });
});

test("an analysis: column and parameter types", () => {
  const t = (s: string) => (readAnalysis(analysis(`readonly cols: ${col(s)};`)) as Analysis).cols[0];
  expect(t(`{ readonly type: "int4"; readonly nullable: true; }`)).toEqual({ name: "c", type: "int4", nullable: true });
  expect(t(`{ readonly type: "int4"; }`)).toEqual({ name: "c", type: "int4", nullable: false });
  expect(t(`{ readonly type: null; readonly nullable: true; }`)).toEqual({ name: "c", type: "null", nullable: true });
  expect(t("1")).toEqual({ name: "c", type: "?", nullable: true });
  expect(t("null")).toEqual({ name: "c", type: "?", nullable: true });
  expect(t(`{ readonly type: 1; readonly nullable: false; }`)).toEqual({ name: "c", type: "?", nullable: false, printed: "1" });
  expect(t("X")).toEqual({ name: "c", type: "?", nullable: true });
  expect(t("A & B")).toEqual({ name: "c", type: "?", nullable: true });
  expect(t(`{ readonly type: "jsonb" & { readonly shape: X; }; readonly nullable: false; }`)).toEqual({ name: "c", type: "jsonb", nullable: false, printed: `{"and":["jsonb",{"shape":{"ref":"X"}}]}` });
  expect(t(`{ readonly type: A & B; readonly nullable: false; }`)).toEqual({ name: "c", type: "?", nullable: false, printed: `{"and":[{"ref":"A"},{"ref":"B"}]}` });
  expect(t(`{ readonly type: X; readonly nullable: false; }`)).toEqual({ name: "c", type: "?", nullable: false, printed: `{"ref":"X"}` });
  expect(t(`{ readonly type: [1]; readonly nullable: false; }`)).toEqual({ name: "c", type: "?", nullable: false, printed: "[1]" });
  const shaped = '`${Shaped<"json", 1>}[][]`';
  expect(t(`{ readonly type: ${shaped}; readonly nullable: false; }`)).toEqual({ name: "c", type: "json[][]", nullable: false, printed: shaped });
  for (const ref of ['`x\\`${Shaped<"json", 1>}[]`', '`${Shaped<"json", 1>}[]`[]', '`${Shaped<"json", 1>}`']) {
    expect(t(`{ readonly type: ${ref}; readonly nullable: false; }`)).toEqual({ name: "c", type: "?", nullable: false, printed: JSON.stringify({ ref }) });
  }
  const p = (s: string) => (readAnalysis(analysis(`readonly params: { readonly 1: ${s}; };`)) as Analysis).params[1];
  expect(p(`{ readonly type: "int4"; readonly nullable: false; } | { readonly type: "text"; readonly nullable: false; }`)).toEqual({ type: "?", nullable: false, printed: "int4 | text" });
  expect(p(`{ readonly type: "unknown"; readonly nullable: false; } | { readonly type: "unknown"; readonly nullable: true; }`)).toEqual({ type: "unknown", nullable: true });
  expect(p(`{ readonly type: "int4"; readonly nullable: false; } | { readonly type: "int4"; readonly nullable: false; }`)).toEqual({ type: "int4", nullable: false });
});
