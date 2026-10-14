/**
 * Runtime query object: `{ text, values }` plus phantom row/param/text types.
 * A `Fragment` is a piece of SQL that can be spliced into a query via `{slot}`.
 */
export declare const ROW: unique symbol;
export declare const PARAMS: unique symbol;
export declare const TEXT: unique symbol;
export declare const CARRIED: unique symbol;

export interface Query<Row, Params extends readonly unknown[] = readonly unknown[], Text extends string = string> {
  readonly text: string;
  readonly values: readonly unknown[];
  readonly [ROW]?: Row;
  readonly [PARAMS]?: Params;
  readonly [TEXT]?: Text;
}

/**
 * A spliceable piece of SQL. `Text` is the literal when known, `string` when dynamic.
 * `Carried` records the TS types of the values the fragment carries (encoded, one per `$n`),
 * so they can be checked against the parameter types once the fragment is spliced.
 */
export interface Fragment<Text extends string = string, Params extends readonly unknown[] = readonly unknown[], Carried extends readonly unknown[] = readonly unknown[]> {
  readonly text: string;
  readonly values: readonly unknown[];
  readonly [TEXT]?: Text;
  readonly [PARAMS]?: Params;
  readonly [CARRIED]?: Carried;
}

export type RowType<Q> = Q extends Query<infer R, readonly unknown[], string> ? R : never;
export type ParamsType<Q> = Q extends { readonly [PARAMS]?: infer P } ? P : never;
export type TextType<Q> = Q extends { readonly [TEXT]?: infer T extends string } ? T : string;

export function makeQuery<Row, Params extends readonly unknown[], Text extends string = string>(text: string, values: readonly unknown[]): Query<Row, Params, Text> {
  return { text, values };
}

export function makeFragment<Text extends string, Params extends readonly unknown[], Carried extends readonly unknown[] = readonly unknown[]>(text: string, values: readonly unknown[]): Fragment<Text, Params, Carried> {
  return { text, values };
}
