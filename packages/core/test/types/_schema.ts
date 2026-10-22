/**
 * Shared schema for the expression-typing tests (operators, functions, aggregates,
 * window, case-coalesce, params, naming, nullability, catalog-augmentation).
 *
 * `things` has one column per Postgres type family plus nullable twins (`n_*`), and an
 * enum (`mood`) registered via `$types`.
 */
import type { Col, Nullable, Generated, RowOf, ParamsOf, Validate, DefaultTypeMap } from "../../src/index.js";

export interface DB {
  users: {
    id: Generated<"int4">;
    email: Col<"text">;
    display_name: Nullable<"text">;
    created_at: Generated<"timestamptz">;
  };
  posts: {
    id: Generated<"int8">;
    author_id: Col<"int4">;
    title: Col<"text">;
    body: Nullable<"text">;
    tags: Col<"text[]">;
    meta: Nullable<"jsonb">;
  };
  things: {
    id: Col<"int4">;
    small: Col<"int2">;
    big: Col<"int8">;
    price: Col<"numeric">;
    ratio: Col<"float8">;
    score: Col<"float4">;
    flag: Col<"bool">;
    label: Col<"text">;
    vc: Col<"varchar">;
    uid: Col<"uuid">;
    day: Col<"date">;
    at: Col<"timestamptz">;
    ts: Col<"timestamp">;
    clock: Col<"time">;
    dur: Col<"interval">;
    data: Col<"jsonb">;
    doc: Col<"json">;
    nums: Col<"int4[]">;
    words: Col<"text[]">;
    bin: Col<"bytea">;
    mood: Col<"mood">;
    rng: Col<"int4range">;
    tsv: Col<"tsvector">;
    n_id: Nullable<"int4">;
    n_big: Nullable<"int8">;
    n_price: Nullable<"numeric">;
    n_flag: Nullable<"bool">;
    n_text: Nullable<"text">;
    n_at: Nullable<"timestamptz">;
    n_data: Nullable<"jsonb">;
    n_nums: Nullable<"int4[]">;
    n_mood: Nullable<"mood">;
  };
  $types: { mood: "happy" | "sad" };
}

export type Row<Q extends string> = RowOf<DB, DefaultTypeMap, Q>;
export type Params<Q extends string> = ParamsOf<DB, DefaultTypeMap, Q>;
export type V<Q extends string> = Validate<DB, Q>;
/** TS type of `interval` under the default type map. */
export type Interval = DefaultTypeMap["interval"];
/** What an int8 / numeric parameter accepts under the default type map (`DefaultParamTypeMap`). */
export type BigIn = string | number | bigint;
/** What a date / timestamp / timestamptz parameter accepts under the default type map. */
export type DateIn = Date | string;
