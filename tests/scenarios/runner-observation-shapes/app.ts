type Alias = { id: number; title: string | null; readonly tag?: "a" | "b" };
const value = { id: 1, title: null, tag: "a" } satisfies Alias;
export const inferred = value;
export const nullable = ["a", null];
export const tuple = [1, "a", null] as const;
export type Aliased = Alias[];
export type Union = { ok: true; value: Alias } | { ok: false; error: string };
export const accidentalAny = JSON.parse("null");
export const unknownValue: unknown = JSON.parse("null");
export function neverValue(): never {
	throw new Error("unreachable");
}
