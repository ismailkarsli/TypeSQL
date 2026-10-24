// A small type-level module for the type-mutate tests.

export type Op = "and" | "or" | "not";

/** Binding powers: AND binds tighter than OR. */
export type Power<O extends Op> =
  O extends "and" ? Pair<2, 3>
  : O extends "or" ? Pair<1, 2>
  : Pair<5, 6>;
type Pair<L extends number, R extends number> = readonly [L, R];

export type IsNull<T> = T extends null ? true : false;

export type First<T> = T extends readonly [infer A extends string, ...unknown[]] ? A : never;

export type Swap<T> = T extends readonly [infer A, infer B] ? readonly [B, A] : never;

export type Nullable<T> = T extends { nullable: true } ? "yes" : "no"; // type-mutate: equivalent never-false – the tests never ask
export type NotPower = Power<"not">;
