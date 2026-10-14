import type { Toks } from "./lexer/tokens.js";
import type { Nx } from "./parser/util.js";

/**
 * "Did you mean" hints for unknown columns and relations. Runs only on the error path.
 *
 * Candidates come from the relations the statement mentions (word tokens that are keys
 * of `DB`, including nested namespaces and views) for column errors, or from all
 * relations for relation errors. The closest candidate within edit distance 2 (and less
 * than the name's length) is suggested, mirroring Postgres's
 * `HINT: Perhaps you meant to reference the column "users.name".`
 */
export type WithHint<M extends string, T extends Toks, DB> =
  M extends `column "${infer Name}" of relation "${infer Rel}" does not exist` ? Hinted<M, Best<Name, ColumnsOf<DB, Rel>>, "column">
  : M extends `column "${infer Name}" does not exist` ? Hinted<M, Best<Name, ColumnsOf<DB, MentionedRels<T, DB, 0, never>>>, "column">
  : M extends `column ${string}.${infer Name} does not exist` ? Hinted<M, Best<Name, ColumnsOf<DB, MentionedRels<T, DB, 0, never>>>, "column">
  : M extends `relation "${infer Name}" does not exist` ? Hinted<M, Best<Name, RelNames<DB>>, "relation">
  : M;

type Hinted<M extends string, S, What extends string> = S extends string ? `${M}. Perhaps you meant the ${What} "${S}"?` : M;

// ─── candidates ───

/** Word / quoted-identifier tokens of the statement that name a relation in `DB`. Unrolled ×2. */
type MentionedRels<T extends Toks, DB, I extends number, Acc> =
  T[I] extends { readonly k: string }
    ? MentionedRels<T, DB, Nx<Nx<I>>, Acc | RelAt<T, Nx<I>, DB> | RelAt<T, I, DB>>
    : Acc;
type RelAt<T extends Toks, I extends number, DB> =
  T[I] extends { readonly k: "w" | "id"; readonly v: infer V extends string } ? (V extends RelNames<DB> ? V : never) : never;

/** Relation names: top-level tables/views and tables inside namespaces. */
type RelNames<DB> = {
  [K in keyof DB & string]: K extends "$types" ? never : IsRelation<DB[K]> extends true ? K : NsRelNames<DB[K]>;
}[keyof DB & string];
type NsRelNames<NS> = { [K in keyof NS & string]: IsRelation<NS[K]> extends true ? K : never }[keyof NS & string];

type IsRelation<X> =
  X extends { readonly $view: unknown } ? true
  : X extends object ? (X[keyof X] extends { readonly type: string } ? true : false)
  : false;

type RelCols<X> = X extends { readonly $view: infer C } ? keyof C & string : keyof X & string;

/** Column names of the given relations (looked up at top level and in every namespace). */
type ColumnsOf<DB, Rels> = {
  [K in keyof DB & string]: K extends Rels
    ? (IsRelation<DB[K]> extends true ? RelCols<DB[K]> : never)
    : IsRelation<DB[K]> extends true ? never
    : { [R in keyof DB[K] & string]: R extends Rels ? RelCols<DB[K][R]> : never }[keyof DB[K] & string];
}[keyof DB & string];

// ─── closest candidate ───

/** The candidate with the smallest edit distance ≤ 2 (and < the name's length), or null. */
type Best<Name extends string, Cands> = Pick2<Name, UnionToTuple<Cands>, null, 3>;
type Pick2<Name extends string, Cs extends readonly unknown[], Best, BestD extends number> =
  Cs extends readonly [infer C extends string, ...infer R]
    ? C extends Name ? Pick2<Name, R, Best, BestD>
    : Dist<Name, C> extends infer D extends number
      ? Lt<D, BestD> extends true ? (Lt<D, Len<Name>> extends true ? Pick2<Name, R, C, D> : Pick2<Name, R, Best, BestD>) : Pick2<Name, R, Best, BestD>
      : never
    : Best;

type UnionToTuple<U, Acc extends unknown[] = []> =
  [U] extends [never] ? Acc
  : LastOf<U> extends infer L ? UnionToTuple<Exclude<U, L>, [L, ...Acc]> : never;
type LastOf<U> = ((U extends unknown ? (x: () => U) => void : never) extends (x: infer I) => void ? I : never) extends () => infer R ? R : never;

// ─── bounded Levenshtein distance (0, 1, 2 or 3 meaning "more than 2") ───

type Chars<S extends string, Acc extends string[] = []> = S extends `${infer C}${infer R}` ? Chars<R, [...Acc, C]> : Acc;
type Len<S extends string> = Chars<S>["length"];

/** Edit distance capped at 3. Prunes on the length difference first. */
type Dist<A extends string, B extends string> =
  Abs<Len<A>, Len<B>> extends infer D extends number
    ? Lt<2, D> extends true ? 3 : Lev<Chars<A>, Chars<B>>
    : never;

type Lev<A extends string[], B extends string[]> =
  A extends [] ? Cap<B["length"]>
  : B extends [] ? Cap<A["length"]>
  : A extends [infer AH, ...infer AT extends string[]]
    ? B extends [infer BH, ...infer BT extends string[]]
      ? AH extends BH ? Lev<AT, BT>
      : Min3<Lev<AT, B>, Lev<A, BT>, Lev<AT, BT>> extends infer M extends number ? Cap<Inc<M>> : never
      : never
    : never;

type Cap<N extends number> = Lt<N, 3> extends true ? N : 3;
type Inc<N extends number> = N extends 0 ? 1 : N extends 1 ? 2 : 3;
type Min3<A extends number, B extends number, C extends number> = Min<A, Min<B, C>>;
type Min<A extends number, B extends number> = Lt<A, B> extends true ? A : B;
type Lt<A extends number, B extends number> = A extends B ? false : Tup<B> extends [...Tup<A>, ...unknown[]] ? true : false;
type Abs<A extends number, B extends number> = Lt<A, B> extends true ? Sub<B, A> : Sub<A, B>;
type Sub<A extends number, B extends number> = Tup<A> extends [...Tup<B>, ...infer R] ? R["length"] : 0;
type Tup<N extends number, A extends unknown[] = []> = A["length"] extends N ? A : Tup<N, [...A, 0]>;
