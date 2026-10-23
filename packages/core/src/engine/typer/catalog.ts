import type { SqlError } from "../errors.js";
import type { ColInfo, Info } from "../types.js";
import type { PgFunctions } from "./pg-functions.js";
import type { CommonLit, DateTimeT, IntT, IsArr, JsonT, LitToText, NumT, RangeT, StrT } from "./operators.js";
import type { JsonRet } from "../json.js";

/**
 * Function catalog, verified against PostgreSQL 17 (`pg_proc` + `pg_typeof`).
 *
 * Users extend it via module augmentation. In an application:
 *
 *   declare module "@typesql/core" {
 *     interface FunctionCatalog { my_func: Sig<["text", "int4"], "bool"> }
 *   }
 *
 * (Augmenting the re-exporting module works because `FunctionCatalog` is an exported
 * interface alias; augmenting `@typesql/core/.../typer/catalog` directly works too.)
 *
 * A schema can also declare its own functions next to its tables, under `$functions`:
 *
 *   interface DB { users: { … }; $functions: { my_func: Sig<["text", "int4"], "bool"> } }
 *
 * Lookup order: `FunctionCatalog`, then `DB["$functions"]`, then `PgFunctions` (every other
 * pg_catalog function, return type only). Any other name is an error, as in Postgres.
 *
 * An entry is one `Sig` or a tuple of `Sig`s (overloads). Overload resolution mimics
 * Postgres: the candidate whose parameters match the most argument types exactly wins;
 * ties go to the earlier overload (list the preferred type — float8, timestamptz — first).
 * If nothing matches by type, the first overload with a compatible arity is used.
 *
 * Parameter patterns:
 *   exact canonical type name (implicit casts accepted: int4 → int8/numeric/float8,
 *   date → timestamp(tz), time → timetz, varchar → text, ...)
 *   "any"          anything (polymorphic, never an exact match)
 *   "anynumeric"   int2 int4 int8 numeric float4 float8
 *   "anystring"    text varchar bpchar char name citext
 *   "anyarray"     any `T[]`
 *   "anyjson"      json jsonb
 *   "anydatetime"  date time timetz timestamp timestamptz
 *   "anyrange"     any range or multirange type
 *   "..."          (last) any number of further arguments
 *   NULL, untyped `$n` and string literals match every pattern (a string literal counts as
 *   an exact match for string parameters: Postgres prefers the string category for
 *   `unknown` arguments, so `substr('abc', 1)` is the text overload).
 *
 * Return patterns:
 *   exact type | "$1".."$4" (type of argument n) | "$elem1" (element type of array /
 *   range type of multirange arg 1) | "$arr1" (array of arg 1) | "$common" (common type
 *   of all args) | "$rangeelem1" (subtype of range arg 1) | "$multirange1" (multirange of
 *   range arg 1) | "$wg" / "$wgarr" (type of the WITHIN GROUP (ORDER BY e) expression /
 *   array of it) | "$pct" / "$pctarr" (percentile_cont: interval for interval input, else
 *   float8) | "$jval:json" … (typed JSON built from the arguments; see `JsonRet` in json.ts).
 *
 * Flags (`SigFlags`):
 *   strict: true (default)  nullable if any argument is nullable
 *   strict: false           nullable only if all arguments are nullable (COALESCE, GREATEST)
 *   strict: [i, j]          nullable if argument i or j (1-based) is nullable; other args may be NULL
 *   nullable: true | false  always / never nullable (overrides everything else)
 *   agg: true               aggregate: nullable when FILTERed, when the query is not grouped
 *                           (empty input → NULL), or when an argument is nullable (with
 *                           `strict: false`, as for json_agg, which collects NULLs:
 *                           only when FILTERed or not grouped)
 *   window: true            window-only function
 *   srf: true               set-returning (usable in FROM; `SrfType`)
 */
export type Sig<Args extends readonly string[], Ret extends string, Flags extends SigFlags = {}> = {
  readonly args: Args;
  readonly ret: Ret;
} & Flags;
export type SigFlags = {
  readonly strict?: boolean | readonly number[];
  readonly nullable?: boolean;
  readonly agg?: boolean;
  readonly window?: boolean;
  readonly srf?: boolean;
};
export type AnySig = { readonly args: readonly string[]; readonly ret: string } & SigFlags;
/** A catalog entry: one signature or an ordered list of overloads. */
export type Overloads = AnySig | readonly AnySig[];

type Agg = { agg: true };
/** A JSON aggregate collects NULL inputs (or skips them) instead of returning NULL: non-null for a non-empty group. */
type AggCollect = { agg: true; strict: false };
type AggNN = { agg: true; nullable: false };
type Win = { window: true; nullable: false };
type WinNullable = { window: true; nullable: true };
type NN = { nullable: false };
type Nullable = { nullable: true };
type Srf = { srf: true };
type SrfNullable = { srf: true; nullable: true };

export interface FunctionCatalog {
  // ───────────── aggregates ─────────────
  count: Sig<["..."], "int8", AggNN>;
  sum: [
    Sig<["int2"], "int8", Agg>, Sig<["int4"], "int8", Agg>, Sig<["int8"], "numeric", Agg>, Sig<["numeric"], "numeric", Agg>,
    Sig<["float4"], "float4", Agg>, Sig<["float8"], "float8", Agg>, Sig<["interval"], "interval", Agg>, Sig<["money"], "money", Agg>,
  ];
  avg: [
    Sig<["int2"], "numeric", Agg>, Sig<["int4"], "numeric", Agg>, Sig<["int8"], "numeric", Agg>, Sig<["numeric"], "numeric", Agg>,
    Sig<["float4"], "float8", Agg>, Sig<["float8"], "float8", Agg>, Sig<["interval"], "interval", Agg>,
  ];
  min: Sig<["any"], "$1", Agg>;
  max: Sig<["any"], "$1", Agg>;
  any_value: Sig<["any"], "$1", Agg>;
  array_agg: Sig<["any"], "$arr1", Agg>;
  string_agg: [Sig<["bytea", "bytea"], "bytea", Agg>, Sig<["anystring", "anystring"], "text", Agg>];
  json_agg: Sig<["any"], "$jarr:json", AggCollect>;
  jsonb_agg: Sig<["any"], "$jarr:jsonb", AggCollect>;
  json_agg_strict: Sig<["any"], "$jarrnn:json", AggCollect>;
  jsonb_agg_strict: Sig<["any"], "$jarrnn:jsonb", AggCollect>;
  json_object_agg: Sig<["any", "any"], "$jrec:json", AggCollect>;
  jsonb_object_agg: Sig<["any", "any"], "$jrec:jsonb", AggCollect>;
  json_object_agg_strict: Sig<["any", "any"], "$jrecnn:json", AggCollect>;
  jsonb_object_agg_strict: Sig<["any", "any"], "$jrecnn:jsonb", AggCollect>;
  json_object_agg_unique: Sig<["any", "any"], "$jrec:json", AggCollect>;
  jsonb_object_agg_unique: Sig<["any", "any"], "$jrec:jsonb", AggCollect>;
  json_object_agg_unique_strict: Sig<["any", "any"], "$jrecnn:json", AggCollect>;
  jsonb_object_agg_unique_strict: Sig<["any", "any"], "$jrecnn:jsonb", AggCollect>;
  bool_and: Sig<["bool"], "bool", Agg>;
  bool_or: Sig<["bool"], "bool", Agg>;
  every: Sig<["bool"], "bool", Agg>;
  bit_and: Sig<["any"], "$1", Agg>;
  bit_or: Sig<["any"], "$1", Agg>;
  bit_xor: Sig<["any"], "$1", Agg>;
  /** stddev/variance family: numeric for exact inputs, float8 for float inputs. */
  stddev: [Sig<["float4"], "float8", Agg>, Sig<["float8"], "float8", Agg>, Sig<["anynumeric"], "numeric", Agg>];
  stddev_pop: [Sig<["float4"], "float8", Agg>, Sig<["float8"], "float8", Agg>, Sig<["anynumeric"], "numeric", Agg>];
  stddev_samp: [Sig<["float4"], "float8", Agg>, Sig<["float8"], "float8", Agg>, Sig<["anynumeric"], "numeric", Agg>];
  variance: [Sig<["float4"], "float8", Agg>, Sig<["float8"], "float8", Agg>, Sig<["anynumeric"], "numeric", Agg>];
  var_pop: [Sig<["float4"], "float8", Agg>, Sig<["float8"], "float8", Agg>, Sig<["anynumeric"], "numeric", Agg>];
  var_samp: [Sig<["float4"], "float8", Agg>, Sig<["float8"], "float8", Agg>, Sig<["anynumeric"], "numeric", Agg>];
  corr: Sig<["float8", "float8"], "float8", Agg>;
  covar_pop: Sig<["float8", "float8"], "float8", Agg>;
  covar_samp: Sig<["float8", "float8"], "float8", Agg>;
  regr_avgx: Sig<["float8", "float8"], "float8", Agg>;
  regr_avgy: Sig<["float8", "float8"], "float8", Agg>;
  regr_count: Sig<["float8", "float8"], "int8", AggNN>;
  regr_intercept: Sig<["float8", "float8"], "float8", Agg>;
  regr_r2: Sig<["float8", "float8"], "float8", Agg>;
  regr_slope: Sig<["float8", "float8"], "float8", Agg>;
  regr_sxx: Sig<["float8", "float8"], "float8", Agg>;
  regr_sxy: Sig<["float8", "float8"], "float8", Agg>;
  regr_syy: Sig<["float8", "float8"], "float8", Agg>;
  /** Ordered-set aggregates: the result type comes from `WITHIN GROUP (ORDER BY e)`. */
  percentile_cont: [Sig<["float8[]"], "$pctarr", Agg>, Sig<["float8"], "$pct", Agg>];
  percentile_disc: [Sig<["float8[]"], "$wgarr", Agg>, Sig<["float8"], "$wg", Agg>];
  mode: Sig<[], "$wg", Agg>;
  range_agg: Sig<["anyrange"], "$multirange1", Agg>;
  range_intersect_agg: Sig<["anyrange"], "$1", Agg>;
  xmlagg: Sig<["xml"], "xml", Agg>;

  // ───────────── window ─────────────
  row_number: Sig<[], "int8", Win>;
  /** `rank()`/`dense_rank()` etc. are window functions; with arguments they are hypothetical-set aggregates. */
  rank: [Sig<[], "int8", Win>, Sig<["any", "..."], "int8", AggNN>];
  dense_rank: [Sig<[], "int8", Win>, Sig<["any", "..."], "int8", AggNN>];
  percent_rank: [Sig<[], "float8", Win>, Sig<["any", "..."], "float8", AggNN>];
  cume_dist: [Sig<[], "float8", Win>, Sig<["any", "..."], "float8", AggNN>];
  ntile: Sig<["int4"], "int4", { window: true }>;
  lag: [Sig<["any"], "$1", WinNullable>, Sig<["any", "int4"], "$1", WinNullable>, Sig<["any", "int4", "any"], "$1", { window: true }>];
  lead: [Sig<["any"], "$1", WinNullable>, Sig<["any", "int4"], "$1", WinNullable>, Sig<["any", "int4", "any"], "$1", { window: true }>];
  first_value: Sig<["any"], "$1", WinNullable>;
  last_value: Sig<["any"], "$1", WinNullable>;
  nth_value: Sig<["any", "int4"], "$1", WinNullable>;

  // ───────────── conditional ─────────────
  coalesce: Sig<["..."], "$common", { strict: false }>;
  nullif: Sig<["any", "any"], "$common", Nullable>;
  /** GREATEST/LEAST ignore NULLs: NULL only when every argument is NULL. */
  greatest: Sig<["any", "..."], "$common", { strict: false }>;
  least: Sig<["any", "..."], "$common", { strict: false }>;
  grouping: Sig<["..."], "int4", NN>;

  // ───────────── string ─────────────
  lower: [Sig<["anystring"], "text">, Sig<["anyrange"], "$rangeelem1", Nullable>];
  upper: [Sig<["anystring"], "text">, Sig<["anyrange"], "$rangeelem1", Nullable>];
  initcap: Sig<["anystring"], "text">;
  length: [Sig<["anystring"], "int4">, Sig<["bytea"], "int4">, Sig<["bytea", "anystring"], "int4">, Sig<["bit"], "int4">, Sig<["varbit"], "int4">, Sig<["tsvector"], "int4">];
  char_length: Sig<["anystring"], "int4">;
  character_length: Sig<["anystring"], "int4">;
  octet_length: [Sig<["anystring"], "int4">, Sig<["bytea"], "int4">, Sig<["bit"], "int4">, Sig<["varbit"], "int4">];
  bit_length: [Sig<["anystring"], "int4">, Sig<["bytea"], "int4">, Sig<["bit"], "int4">, Sig<["varbit"], "int4">];
  bit_count: [Sig<["bytea"], "int8">, Sig<["bit"], "int8">, Sig<["varbit"], "int8">];
  /** `concat` skips NULLs and never returns NULL; `concat_ws`/`format` are NULL only for a NULL separator/format. */
  concat: Sig<["any", "..."], "text", NN>;
  concat_ws: Sig<["anystring", "..."], "text", { strict: [1] }>;
  format: Sig<["anystring", "..."], "text", { strict: [1] }>;
  left: Sig<["anystring", "int4"], "text">;
  right: Sig<["anystring", "int4"], "text">;
  lpad: [Sig<["anystring", "int4"], "text">, Sig<["anystring", "int4", "anystring"], "text">];
  rpad: [Sig<["anystring", "int4"], "text">, Sig<["anystring", "int4", "anystring"], "text">];
  ltrim: [Sig<["bytea", "bytea"], "bytea">, Sig<["anystring"], "text">, Sig<["anystring", "anystring"], "text">];
  rtrim: [Sig<["bytea", "bytea"], "bytea">, Sig<["anystring"], "text">, Sig<["anystring", "anystring"], "text">];
  btrim: [Sig<["bytea", "bytea"], "bytea">, Sig<["anystring"], "text">, Sig<["anystring", "anystring"], "text">];
  repeat: Sig<["anystring", "int4"], "text">;
  replace: Sig<["anystring", "anystring", "anystring"], "text">;
  reverse: Sig<["anystring"], "text">;
  split_part: Sig<["anystring", "anystring", "int4"], "text">;
  strpos: Sig<["anystring", "anystring"], "int4">;
  substr: [Sig<["bytea", "int4"], "bytea">, Sig<["bytea", "int4", "int4"], "bytea">, Sig<["anystring", "int4"], "text">, Sig<["anystring", "int4", "int4"], "text">];
  translate: Sig<["anystring", "anystring", "anystring"], "text">;
  starts_with: Sig<["anystring", "anystring"], "bool">;
  ascii: Sig<["anystring"], "int4">;
  chr: Sig<["int4"], "text">;
  quote_ident: Sig<["anystring"], "text">;
  quote_literal: Sig<["any"], "text">;
  quote_nullable: Sig<["any"], "text", NN>;
  regexp_replace: [
    Sig<["anystring", "anystring", "anystring"], "text">, Sig<["anystring", "anystring", "anystring", "anystring"], "text">,
    Sig<["anystring", "anystring", "anystring", "int4"], "text">, Sig<["anystring", "anystring", "anystring", "int4", "int4"], "text">,
    Sig<["anystring", "anystring", "anystring", "int4", "int4", "anystring"], "text">,
  ];
  regexp_match: [Sig<["anystring", "anystring"], "text[]", Nullable>, Sig<["anystring", "anystring", "anystring"], "text[]", Nullable>];
  regexp_matches: [Sig<["anystring", "anystring"], "text[]", Srf>, Sig<["anystring", "anystring", "anystring"], "text[]", Srf>];
  regexp_split_to_array: [Sig<["anystring", "anystring"], "text[]">, Sig<["anystring", "anystring", "anystring"], "text[]">];
  regexp_split_to_table: [Sig<["anystring", "anystring"], "text", Srf>, Sig<["anystring", "anystring", "anystring"], "text", Srf>];
  regexp_count: [Sig<["anystring", "anystring"], "int4">, Sig<["anystring", "anystring", "int4"], "int4">, Sig<["anystring", "anystring", "int4", "anystring"], "int4">];
  regexp_like: [Sig<["anystring", "anystring"], "bool">, Sig<["anystring", "anystring", "anystring"], "bool">];
  regexp_instr: [
    Sig<["anystring", "anystring"], "int4">, Sig<["anystring", "anystring", "int4"], "int4">, Sig<["anystring", "anystring", "int4", "int4"], "int4">,
    Sig<["anystring", "anystring", "int4", "int4", "int4"], "int4">, Sig<["anystring", "anystring", "int4", "int4", "int4", "anystring"], "int4">,
    Sig<["anystring", "anystring", "int4", "int4", "int4", "anystring", "int4"], "int4">,
  ];
  regexp_substr: [
    Sig<["anystring", "anystring"], "text", Nullable>, Sig<["anystring", "anystring", "int4"], "text", Nullable>,
    Sig<["anystring", "anystring", "int4", "int4"], "text", Nullable>, Sig<["anystring", "anystring", "int4", "int4", "anystring"], "text", Nullable>,
    Sig<["anystring", "anystring", "int4", "int4", "anystring", "int4"], "text", Nullable>,
  ];
  string_to_array: [Sig<["anystring", "anystring"], "text[]", { strict: [1] }>, Sig<["anystring", "anystring", "anystring"], "text[]", { strict: [1] }>];
  string_to_table: [Sig<["anystring", "anystring"], "text", { srf: true; strict: [1] }>, Sig<["anystring", "anystring", "anystring"], "text", { srf: true; strict: [1] }>];
  to_hex: Sig<["anynumeric"], "text">;
  to_bin: Sig<["anynumeric"], "text">;
  to_oct: Sig<["anynumeric"], "text">;
  to_char: Sig<["any", "anystring"], "text">;
  to_number: Sig<["anystring", "anystring"], "numeric">;
  to_date: Sig<["anystring", "anystring"], "date">;
  to_timestamp: [Sig<["anystring", "anystring"], "timestamptz">, Sig<["anynumeric"], "timestamptz">];
  parse_ident: [Sig<["anystring"], "text[]">, Sig<["anystring", "bool"], "text[]">];
  unistr: Sig<["anystring"], "text">;
  normalize: [Sig<["anystring"], "text">, Sig<["anystring", "anystring"], "text">];
  /** `e IS [NFC | NFD | NFKC | NFKD] NORMALIZED` */
  is_normalized: [Sig<["anystring"], "bool">, Sig<["anystring", "anystring"], "bool">];
  /** `COLLATION FOR (e)`: the collation's name (Postgres errors for a type without collations). */
  pg_collation_for: Sig<["any"], "text", NN>;
  convert_from: Sig<["bytea", "anystring"], "text">;
  convert_to: Sig<["anystring", "anystring"], "bytea">;
  convert: Sig<["bytea", "anystring", "anystring"], "bytea">;
  get_byte: Sig<["bytea", "int4"], "int4">;
  set_byte: Sig<["bytea", "int4", "int4"], "bytea">;
  get_bit: [Sig<["bytea", "int8"], "int4">, Sig<["bit", "int4"], "int4">, Sig<["varbit", "int4"], "int4">];
  set_bit: [Sig<["bytea", "int8", "int4"], "bytea">, Sig<["bit", "int4", "int4"], "bit">, Sig<["varbit", "int4", "int4"], "varbit">];
  text: Sig<["any"], "text">;
  md5: [Sig<["bytea"], "text">, Sig<["anystring"], "text">];
  sha224: Sig<["bytea"], "bytea">;
  sha256: Sig<["bytea"], "bytea">;
  sha384: Sig<["bytea"], "bytea">;
  sha512: Sig<["bytea"], "bytea">;
  encode: Sig<["bytea", "anystring"], "text">;
  decode: Sig<["anystring", "anystring"], "bytea">;

  // ───────────── numeric ─────────────
  abs: Sig<["anynumeric"], "$1">;
  /** Integer inputs resolve to the float8 overload (`round(1)` → float8), numeric stays numeric. */
  ceil: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">];
  ceiling: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">];
  floor: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">];
  sign: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">];
  round: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">, Sig<["numeric", "int4"], "numeric">];
  trunc: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">, Sig<["numeric", "int4"], "numeric">, Sig<["macaddr"], "macaddr">, Sig<["macaddr8"], "macaddr8">];
  mod: [Sig<["int2", "int2"], "int2">, Sig<["int4", "int4"], "int4">, Sig<["int8", "int8"], "int8">, Sig<["numeric", "numeric"], "numeric">];
  div: Sig<["numeric", "numeric"], "numeric">;
  power: [Sig<["float8", "float8"], "float8">, Sig<["numeric", "numeric"], "numeric">];
  sqrt: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">];
  cbrt: Sig<["float8"], "float8">;
  exp: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">];
  ln: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">];
  log: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">, Sig<["numeric", "numeric"], "numeric">];
  log10: [Sig<["float8"], "float8">, Sig<["numeric"], "numeric">];
  pi: Sig<[], "float8", NN>;
  random: [Sig<[], "float8", NN>, Sig<["int4", "int4"], "int4">, Sig<["int8", "int8"], "int8">, Sig<["numeric", "numeric"], "numeric">];
  random_normal: Sig<["..."], "float8">;
  setseed: Sig<["float8"], "void">;
  width_bucket: [Sig<["anynumeric", "anynumeric", "anynumeric", "int4"], "int4">, Sig<["any", "anyarray"], "int4">];
  scale: Sig<["numeric"], "int4">;
  min_scale: Sig<["numeric"], "int4">;
  trim_scale: Sig<["numeric"], "numeric">;
  gcd: [Sig<["int4", "int4"], "int4">, Sig<["int8", "int8"], "int8">, Sig<["numeric", "numeric"], "numeric">];
  lcm: [Sig<["int4", "int4"], "int4">, Sig<["int8", "int8"], "int8">, Sig<["numeric", "numeric"], "numeric">];
  factorial: Sig<["int8"], "numeric">;
  sin: Sig<["float8"], "float8">; cos: Sig<["float8"], "float8">; tan: Sig<["float8"], "float8">; cot: Sig<["float8"], "float8">;
  asin: Sig<["float8"], "float8">; acos: Sig<["float8"], "float8">; atan: Sig<["float8"], "float8">; atan2: Sig<["float8", "float8"], "float8">;
  sinh: Sig<["float8"], "float8">; cosh: Sig<["float8"], "float8">; tanh: Sig<["float8"], "float8">;
  asinh: Sig<["float8"], "float8">; acosh: Sig<["float8"], "float8">; atanh: Sig<["float8"], "float8">;
  sind: Sig<["float8"], "float8">; cosd: Sig<["float8"], "float8">; tand: Sig<["float8"], "float8">; cotd: Sig<["float8"], "float8">;
  asind: Sig<["float8"], "float8">; acosd: Sig<["float8"], "float8">; atand: Sig<["float8"], "float8">; atan2d: Sig<["float8", "float8"], "float8">;
  degrees: Sig<["float8"], "float8">; radians: Sig<["float8"], "float8">;
  erf: Sig<["float8"], "float8">; erfc: Sig<["float8"], "float8">;

  // ───────────── date / time ─────────────
  now: Sig<[], "timestamptz", NN>;
  clock_timestamp: Sig<[], "timestamptz", NN>;
  statement_timestamp: Sig<[], "timestamptz", NN>;
  transaction_timestamp: Sig<[], "timestamptz", NN>;
  timeofday: Sig<[], "text", NN>;
  current_date: Sig<[], "date", NN>;
  current_time: Sig<[], "timetz", NN>;
  current_timestamp: Sig<[], "timestamptz", NN>;
  localtime: Sig<[], "time", NN>;
  localtimestamp: Sig<[], "timestamp", NN>;
  age: [Sig<["anydatetime"], "interval">, Sig<["anydatetime", "anydatetime"], "interval">];
  date_part: Sig<["anystring", "any"], "float8">;
  /** `date_trunc('day', date)` → timestamptz (date is cast to the preferred timestamptz). */
  date_trunc: [Sig<["anystring", "timestamptz"], "timestamptz">, Sig<["anystring", "timestamp"], "timestamp">, Sig<["anystring", "interval"], "interval">, Sig<["anystring", "timestamptz", "anystring"], "timestamptz">];
  date_bin: [Sig<["interval", "timestamptz", "timestamptz"], "timestamptz">, Sig<["interval", "timestamp", "timestamp"], "timestamp">];
  date_add: [Sig<["timestamptz", "interval"], "timestamptz">, Sig<["timestamptz", "interval", "anystring"], "timestamptz">];
  date_subtract: [Sig<["timestamptz", "interval"], "timestamptz">, Sig<["timestamptz", "interval", "anystring"], "timestamptz">];
  make_date: Sig<["int4", "int4", "int4"], "date">;
  make_time: Sig<["int4", "int4", "float8"], "time">;
  make_timestamp: Sig<["int4", "int4", "int4", "int4", "int4", "float8"], "timestamp">;
  make_timestamptz: [Sig<["int4", "int4", "int4", "int4", "int4", "float8"], "timestamptz">, Sig<["int4", "int4", "int4", "int4", "int4", "float8", "anystring"], "timestamptz">];
  make_interval: Sig<["..."], "interval">;
  justify_days: Sig<["interval"], "interval">;
  justify_hours: Sig<["interval"], "interval">;
  justify_interval: Sig<["interval"], "interval">;
  isfinite: Sig<["any"], "bool">;
  /** `(start, end | interval) OVERLAPS (start, end | interval)` */
  overlaps: Sig<["any", "any", "any", "any"], "bool">;
  extract: Sig<["anystring", "any"], "numeric">;
  /** `timezone(zone, timestamptz)` → timestamp and vice versa (the function form of AT TIME ZONE). */
  timezone: [
    Sig<["any", "timestamptz"], "timestamp">, Sig<["any", "timestamp"], "timestamptz">, Sig<["any", "timetz"], "timetz">,
    Sig<["timestamptz"], "timestamp">, Sig<["timestamp"], "timestamptz">, Sig<["timetz"], "timetz">,
  ];
  generate_series: [
    Sig<["int4", "int4"], "int4", Srf>, Sig<["int4", "int4", "int4"], "int4", Srf>,
    Sig<["int8", "int8"], "int8", Srf>, Sig<["int8", "int8", "int8"], "int8", Srf>,
    Sig<["numeric", "numeric"], "numeric", Srf>, Sig<["numeric", "numeric", "numeric"], "numeric", Srf>,
    Sig<["timestamptz", "timestamptz", "interval"], "timestamptz", Srf>, Sig<["timestamp", "timestamp", "interval"], "timestamp", Srf>,
    Sig<["timestamptz", "timestamptz", "interval", "anystring"], "timestamptz", Srf>,
  ];
  generate_subscripts: [Sig<["anyarray", "int4"], "int4", Srf>, Sig<["anyarray", "int4", "bool"], "int4", Srf>];

  // ───────────── session / system ─────────────
  current_user: Sig<[], "name", NN>;
  current_role: Sig<[], "name", NN>;
  session_user: Sig<[], "name", NN>;
  system_user: Sig<[], "text", Nullable>;
  user: Sig<[], "name", NN>;
  current_catalog: Sig<[], "name", NN>;
  current_schema: Sig<[], "name", NN>;
  current_database: Sig<[], "name", NN>;
  current_schemas: Sig<["bool"], "name[]">;
  current_query: Sig<[], "text", Nullable>;
  current_setting: [Sig<["anystring"], "text">, Sig<["anystring", "bool"], "text", Nullable>];
  set_config: Sig<["anystring", "anystring", "bool"], "text">;
  pg_backend_pid: Sig<[], "int4", NN>;
  pg_cancel_backend: Sig<["int4"], "bool">;
  pg_terminate_backend: [Sig<["int4"], "bool">, Sig<["int4", "int8"], "bool">];
  version: Sig<[], "text", NN>;
  pg_typeof: Sig<["any"], "regtype", NN>;
  pg_column_size: Sig<["any"], "int4">;
  pg_size_pretty: [Sig<["int8"], "text">, Sig<["numeric"], "text">];
  pg_total_relation_size: Sig<["any"], "int8">;
  pg_relation_size: [Sig<["any"], "int8">, Sig<["any", "anystring"], "int8">];
  pg_database_size: Sig<["any"], "int8">;
  pg_postmaster_start_time: Sig<[], "timestamptz", NN>;
  pg_conf_load_time: Sig<[], "timestamptz", NN>;
  pg_is_in_recovery: Sig<[], "bool", NN>;
  inet_client_addr: Sig<[], "inet", Nullable>;
  inet_server_addr: Sig<[], "inet", Nullable>;
  obj_description: [Sig<["any"], "text", Nullable>, Sig<["any", "anystring"], "text", Nullable>];
  col_description: Sig<["any", "int4"], "text", Nullable>;
  to_regclass: Sig<["anystring"], "regclass", Nullable>;
  to_regtype: Sig<["anystring"], "regtype", Nullable>;
  to_regproc: Sig<["anystring"], "regproc", Nullable>;
  pg_sleep: Sig<["float8"], "void">;
  pg_sleep_for: Sig<["interval"], "void">;
  pg_sleep_until: Sig<["timestamptz"], "void">;
  pg_advisory_lock: [Sig<["int8"], "void">, Sig<["int4", "int4"], "void">];
  pg_advisory_xact_lock: [Sig<["int8"], "void">, Sig<["int4", "int4"], "void">];
  pg_try_advisory_lock: [Sig<["int8"], "bool">, Sig<["int4", "int4"], "bool">];
  pg_advisory_unlock: [Sig<["int8"], "bool">, Sig<["int4", "int4"], "bool">];
  pg_notify: Sig<["anystring", "anystring"], "void">;
  txid_current: Sig<[], "int8", NN>;
  pg_current_xact_id: Sig<[], "xid8", NN>;
  num_nulls: Sig<["..."], "int4", NN>;
  num_nonnulls: Sig<["..."], "int4", NN>;

  // ───────────── sequences ─────────────
  nextval: Sig<["any"], "int8">;
  currval: Sig<["any"], "int8">;
  setval: [Sig<["any", "int8"], "int8">, Sig<["any", "int8", "bool"], "int8">];
  lastval: Sig<[], "int8", NN>;

  // ───────────── uuid / crypto (pgcrypto, uuid-ossp) ─────────────
  gen_random_uuid: Sig<[], "uuid", NN>;
  uuid_generate_v1: Sig<[], "uuid", NN>;
  uuid_generate_v1mc: Sig<[], "uuid", NN>;
  uuid_generate_v3: Sig<["uuid", "anystring"], "uuid">;
  uuid_generate_v4: Sig<[], "uuid", NN>;
  uuid_generate_v5: Sig<["uuid", "anystring"], "uuid">;
  uuid_nil: Sig<[], "uuid", NN>;
  uuid_extract_timestamp: Sig<["uuid"], "timestamptz", Nullable>;
  uuid_extract_version: Sig<["uuid"], "int2", Nullable>;
  gen_random_bytes: Sig<["int4"], "bytea">;
  digest: [Sig<["bytea", "anystring"], "bytea">, Sig<["anystring", "anystring"], "bytea">];
  hmac: [Sig<["bytea", "bytea", "anystring"], "bytea">, Sig<["anystring", "anystring", "anystring"], "bytea">];
  crypt: Sig<["anystring", "anystring"], "text">;
  gen_salt: [Sig<["anystring"], "text">, Sig<["anystring", "int4"], "text">];

  // ───────────── text matching extensions (unaccent, pg_trgm, fuzzystrmatch) ─────────────
  unaccent: [Sig<["anystring"], "text">, Sig<["any", "anystring"], "text">];
  similarity: Sig<["anystring", "anystring"], "float4">;
  word_similarity: Sig<["anystring", "anystring"], "float4">;
  strict_word_similarity: Sig<["anystring", "anystring"], "float4">;
  show_trgm: Sig<["anystring"], "text[]">;
  levenshtein: [Sig<["anystring", "anystring"], "int4">, Sig<["anystring", "anystring", "int4", "int4", "int4"], "int4">];
  levenshtein_less_equal: [Sig<["anystring", "anystring", "int4"], "int4">, Sig<["anystring", "anystring", "int4", "int4", "int4", "int4"], "int4">];
  soundex: Sig<["anystring"], "text">;
  difference: Sig<["anystring", "anystring"], "int4">;
  metaphone: Sig<["anystring", "int4"], "text">;
  dmetaphone: Sig<["anystring"], "text">;
  dmetaphone_alt: Sig<["anystring"], "text">;

  // ───────────── arrays ─────────────
  unnest: [Sig<["anyarray"], "$elem1", Srf>, Sig<["anyrange"], "$elem1", Srf>];
  /** `array_length('{}', 1)` is NULL, as are the bounds/dims of an empty array. */
  array_length: Sig<["anyarray", "int4"], "int4", Nullable>;
  cardinality: Sig<["anyarray"], "int4">;
  array_append: Sig<["anyarray", "any"], "$1", { strict: [1] }>;
  array_prepend: Sig<["any", "anyarray"], "$2", { strict: [2] }>;
  array_cat: Sig<["anyarray", "anyarray"], "$1", { strict: false }>;
  array_remove: Sig<["anyarray", "any"], "$1", { strict: [1] }>;
  array_replace: Sig<["anyarray", "any", "any"], "$1", { strict: [1] }>;
  array_position: [Sig<["anyarray", "any"], "int4", Nullable>, Sig<["anyarray", "any", "int4"], "int4", Nullable>];
  array_positions: Sig<["anyarray", "any"], "int4[]", { strict: [1] }>;
  array_to_string: [Sig<["anyarray", "anystring"], "text">, Sig<["anyarray", "anystring", "anystring"], "text", { strict: [1, 2] }>];
  array_upper: Sig<["anyarray", "int4"], "int4", Nullable>;
  array_lower: Sig<["anyarray", "int4"], "int4", Nullable>;
  array_ndims: Sig<["anyarray"], "int4", Nullable>;
  array_dims: Sig<["anyarray"], "text", Nullable>;
  array_fill: [Sig<["any", "int4[]"], "$arr1">, Sig<["any", "int4[]", "int4[]"], "$arr1">];
  array_to_json: [Sig<["anyarray"], "$jval:json">, Sig<["anyarray", "bool"], "$jval:json">];
  array_sample: Sig<["anyarray", "int4"], "$1">;
  array_shuffle: Sig<["anyarray"], "$1">;
  trim_array: Sig<["anyarray", "int4"], "$1">;

  // ───────────── JSON ─────────────
  to_json: Sig<["any"], "$jval:json">;
  to_jsonb: Sig<["any"], "$jval:jsonb">;
  json_build_object: Sig<["..."], "json", NN>;
  jsonb_build_object: Sig<["..."], "jsonb", NN>;
  json_build_array: Sig<["..."], "$jtup:json", NN>;
  jsonb_build_array: Sig<["..."], "$jtup:jsonb", NN>;
  json_object: [Sig<["text[]"], "json">, Sig<["text[]", "text[]"], "json">];
  jsonb_object: [Sig<["text[]"], "jsonb">, Sig<["text[]", "text[]"], "jsonb">];
  json_array_length: Sig<["json"], "int4">;
  jsonb_array_length: Sig<["jsonb"], "int4">;
  /** Path extraction yields NULL for a missing path. */
  json_extract_path: Sig<["json", "..."], "json", Nullable>;
  jsonb_extract_path: Sig<["jsonb", "..."], "jsonb", Nullable>;
  json_extract_path_text: Sig<["json", "..."], "text", Nullable>;
  jsonb_extract_path_text: Sig<["jsonb", "..."], "text", Nullable>;
  json_typeof: Sig<["json"], "text">;
  jsonb_typeof: Sig<["jsonb"], "text">;
  json_strip_nulls: Sig<["json"], "json">;
  jsonb_strip_nulls: Sig<["jsonb"], "jsonb">;
  jsonb_set: [Sig<["jsonb", "text[]", "jsonb"], "jsonb">, Sig<["jsonb", "text[]", "jsonb", "bool"], "jsonb">];
  jsonb_set_lax: [
    Sig<["jsonb", "text[]", "jsonb"], "jsonb", { strict: [1, 2] }>, Sig<["jsonb", "text[]", "jsonb", "bool"], "jsonb", { strict: [1, 2] }>,
    Sig<["jsonb", "text[]", "jsonb", "bool", "anystring"], "jsonb", { strict: [1, 2] }>,
  ];
  jsonb_insert: [Sig<["jsonb", "text[]", "jsonb"], "jsonb">, Sig<["jsonb", "text[]", "jsonb", "bool"], "jsonb">];
  jsonb_pretty: Sig<["jsonb"], "text">;
  jsonb_path_exists: [Sig<["jsonb", "jsonpath"], "bool">, Sig<["jsonb", "jsonpath", "jsonb"], "bool">, Sig<["jsonb", "jsonpath", "jsonb", "bool"], "bool">];
  jsonb_path_match: [Sig<["jsonb", "jsonpath"], "bool">, Sig<["jsonb", "jsonpath", "jsonb"], "bool">, Sig<["jsonb", "jsonpath", "jsonb", "bool"], "bool">];
  jsonb_path_query: [Sig<["jsonb", "jsonpath"], "jsonb", Srf>, Sig<["jsonb", "jsonpath", "jsonb"], "jsonb", Srf>, Sig<["jsonb", "jsonpath", "jsonb", "bool"], "jsonb", Srf>];
  jsonb_path_query_array: [Sig<["jsonb", "jsonpath"], "jsonb">, Sig<["jsonb", "jsonpath", "jsonb"], "jsonb">, Sig<["jsonb", "jsonpath", "jsonb", "bool"], "jsonb">];
  jsonb_path_query_first: [Sig<["jsonb", "jsonpath"], "jsonb", Nullable>, Sig<["jsonb", "jsonpath", "jsonb"], "jsonb", Nullable>, Sig<["jsonb", "jsonpath", "jsonb", "bool"], "jsonb", Nullable>];
  jsonb_path_exists_tz: [Sig<["jsonb", "jsonpath"], "bool">, Sig<["jsonb", "jsonpath", "jsonb"], "bool">, Sig<["jsonb", "jsonpath", "jsonb", "bool"], "bool">];
  jsonb_path_match_tz: [Sig<["jsonb", "jsonpath"], "bool">, Sig<["jsonb", "jsonpath", "jsonb"], "bool">, Sig<["jsonb", "jsonpath", "jsonb", "bool"], "bool">];
  jsonb_path_query_tz: [Sig<["jsonb", "jsonpath"], "jsonb", Srf>, Sig<["jsonb", "jsonpath", "jsonb"], "jsonb", Srf>, Sig<["jsonb", "jsonpath", "jsonb", "bool"], "jsonb", Srf>];
  jsonb_path_query_array_tz: [Sig<["jsonb", "jsonpath"], "jsonb">, Sig<["jsonb", "jsonpath", "jsonb"], "jsonb">, Sig<["jsonb", "jsonpath", "jsonb", "bool"], "jsonb">];
  jsonb_path_query_first_tz: [Sig<["jsonb", "jsonpath"], "jsonb", Nullable>, Sig<["jsonb", "jsonpath", "jsonb"], "jsonb", Nullable>, Sig<["jsonb", "jsonpath", "jsonb", "bool"], "jsonb", Nullable>];
  json_array_elements: Sig<["json"], "$jelem:json", Srf>;
  jsonb_array_elements: Sig<["jsonb"], "$jelem:jsonb", Srf>;
  /** A JSON null element becomes SQL NULL in the `_text` variants. */
  json_array_elements_text: Sig<["json"], "text", SrfNullable>;
  jsonb_array_elements_text: Sig<["jsonb"], "text", SrfNullable>;
  json_object_keys: Sig<["json"], "text", Srf>;
  jsonb_object_keys: Sig<["jsonb"], "text", Srf>;
  row_to_json: [Sig<["any"], "$jval:json">, Sig<["any", "bool"], "$jval:json">];
  /** `json_populate_record(null::t, j)` has the type of its first argument. */
  json_populate_record: [Sig<["any", "json"], "$1">, Sig<["any", "json", "bool"], "$1">];
  jsonb_populate_record: Sig<["any", "jsonb"], "$1">;
  json_populate_recordset: [Sig<["any", "json"], "$1", Srf>, Sig<["any", "json", "bool"], "$1", Srf>];
  jsonb_populate_recordset: Sig<["any", "jsonb"], "$1", Srf>;
  json_to_record: Sig<["json"], "record">;
  jsonb_to_record: Sig<["jsonb"], "record">;
  json_to_recordset: Sig<["json"], "record", Srf>;
  jsonb_to_recordset: Sig<["jsonb"], "record", Srf>;
  jsonb_exists: Sig<["jsonb", "anystring"], "bool">;
  jsonb_exists_any: Sig<["jsonb", "text[]"], "bool">;
  jsonb_exists_all: Sig<["jsonb", "text[]"], "bool">;
  jsonb_contains: Sig<["jsonb", "jsonb"], "bool">;
  jsonb_contained: Sig<["jsonb", "jsonb"], "bool">;
  jsonb_concat: Sig<["jsonb", "jsonb"], "jsonb">;
  jsonb_delete: [Sig<["jsonb", "anystring"], "jsonb">, Sig<["jsonb", "int4"], "jsonb">, Sig<["jsonb", "text[]"], "jsonb">];
  jsonb_delete_path: Sig<["jsonb", "text[]"], "jsonb">;
  json_scalar: Sig<["any"], "json">;

  // ───────────── network ─────────────
  host: Sig<["inet"], "text">;
  masklen: Sig<["inet"], "int4">;
  network: Sig<["inet"], "cidr">;
  abbrev: Sig<["inet"], "text">;
  broadcast: Sig<["inet"], "inet">;
  family: Sig<["inet"], "int4">;
  hostmask: Sig<["inet"], "inet">;
  netmask: Sig<["inet"], "inet">;
  set_masklen: [Sig<["cidr", "int4"], "cidr">, Sig<["inet", "int4"], "inet">];
  inet_same_family: Sig<["inet", "inet"], "bool">;
  inet_merge: Sig<["inet", "inet"], "cidr">;

  // ───────────── text search ─────────────
  to_tsvector: [Sig<["anyjson"], "tsvector">, Sig<["anystring"], "tsvector">, Sig<["any", "anyjson"], "tsvector">, Sig<["any", "anystring"], "tsvector">];
  to_tsquery: [Sig<["anystring"], "tsquery">, Sig<["any", "anystring"], "tsquery">];
  plainto_tsquery: [Sig<["anystring"], "tsquery">, Sig<["any", "anystring"], "tsquery">];
  phraseto_tsquery: [Sig<["anystring"], "tsquery">, Sig<["any", "anystring"], "tsquery">];
  websearch_to_tsquery: [Sig<["anystring"], "tsquery">, Sig<["any", "anystring"], "tsquery">];
  ts_rank: [Sig<["tsvector", "tsquery"], "float4">, Sig<["tsvector", "tsquery", "int4"], "float4">, Sig<["float4[]", "tsvector", "tsquery"], "float4">, Sig<["float4[]", "tsvector", "tsquery", "int4"], "float4">];
  ts_rank_cd: [Sig<["tsvector", "tsquery"], "float4">, Sig<["tsvector", "tsquery", "int4"], "float4">, Sig<["float4[]", "tsvector", "tsquery"], "float4">, Sig<["float4[]", "tsvector", "tsquery", "int4"], "float4">];
  ts_headline: [
    Sig<["anyjson", "tsquery"], "$1">, Sig<["anyjson", "tsquery", "anystring"], "$1">,
    Sig<["anystring", "tsquery"], "text">, Sig<["anystring", "tsquery", "anystring"], "text">,
    Sig<["any", "anyjson", "tsquery"], "$2">, Sig<["any", "anyjson", "tsquery", "anystring"], "$2">,
    Sig<["any", "anystring", "tsquery"], "text">, Sig<["any", "anystring", "tsquery", "anystring"], "text">,
  ];
  setweight: [Sig<["tsvector", "anystring"], "tsvector">, Sig<["tsvector", "anystring", "text[]"], "tsvector">];
  strip: Sig<["tsvector"], "tsvector">;
  numnode: Sig<["tsquery"], "int4">;
  querytree: Sig<["tsquery"], "text">;
  tsvector_to_array: Sig<["tsvector"], "text[]">;
  array_to_tsvector: Sig<["text[]"], "tsvector">;
  ts_delete: [Sig<["tsvector", "anystring"], "tsvector">, Sig<["tsvector", "text[]"], "tsvector">];
  ts_filter: Sig<["tsvector", "any"], "tsvector">;
  ts_rewrite: [Sig<["tsquery", "anystring"], "tsquery">, Sig<["tsquery", "tsquery", "tsquery"], "tsquery">];
  tsquery_phrase: [Sig<["tsquery", "tsquery"], "tsquery">, Sig<["tsquery", "tsquery", "int4"], "tsquery">];
  get_current_ts_config: Sig<[], "regconfig", NN>;
  ts_lexize: Sig<["any", "anystring"], "text[]", Nullable>;

  // ───────────── ranges ─────────────
  isempty: Sig<["anyrange"], "bool">;
  lower_inc: Sig<["anyrange"], "bool">;
  upper_inc: Sig<["anyrange"], "bool">;
  lower_inf: Sig<["anyrange"], "bool">;
  upper_inf: Sig<["anyrange"], "bool">;
  range_merge: [Sig<["anyrange", "anyrange"], "$1">, Sig<["anyrange"], "$elem1">];
  /** Range constructors accept NULL bounds (unbounded) and never return NULL. */
  int4range: [Sig<["int4", "int4"], "int4range", NN>, Sig<["int4", "int4", "anystring"], "int4range", NN>];
  int8range: [Sig<["int8", "int8"], "int8range", NN>, Sig<["int8", "int8", "anystring"], "int8range", NN>];
  numrange: [Sig<["numeric", "numeric"], "numrange", NN>, Sig<["numeric", "numeric", "anystring"], "numrange", NN>];
  tsrange: [Sig<["timestamp", "timestamp"], "tsrange", NN>, Sig<["timestamp", "timestamp", "anystring"], "tsrange", NN>];
  tstzrange: [Sig<["timestamptz", "timestamptz"], "tstzrange", NN>, Sig<["timestamptz", "timestamptz", "anystring"], "tstzrange", NN>];
  daterange: [Sig<["date", "date"], "daterange", NN>, Sig<["date", "date", "anystring"], "daterange", NN>];
  int4multirange: Sig<["..."], "int4multirange", NN>;
  int8multirange: Sig<["..."], "int8multirange", NN>;
  nummultirange: Sig<["..."], "nummultirange", NN>;
  tsmultirange: Sig<["..."], "tsmultirange", NN>;
  tstzmultirange: Sig<["..."], "tstzmultirange", NN>;
  datemultirange: Sig<["..."], "datemultirange", NN>;
  multirange: Sig<["anyrange"], "$multirange1">;

  // ───────────── enums ─────────────
  enum_first: Sig<["any"], "$1", NN>;
  enum_last: Sig<["any"], "$1", NN>;
  enum_range: [Sig<["any"], "$arr1", NN>, Sig<["any", "any"], "$arr1", NN>];

  // ───────────── XML (XMLELEMENT, XMLPARSE, ... are special forms: typer/xml.ts) ─────────────
  /** `XMLEXISTS(x PASSING d)` is parsed as this call. */
  xmlexists: Sig<["text", "xml"], "bool">;
  xpath: [Sig<["text", "xml"], "xml[]">, Sig<["text", "xml", "text[]"], "xml[]">];
  xpath_exists: [Sig<["text", "xml"], "bool">, Sig<["text", "xml", "text[]"], "bool">];
  xmlcomment: Sig<["text"], "xml">;
  xmltext: Sig<["text"], "xml">;
  xml_is_well_formed: Sig<["text"], "bool">;
  xml_is_well_formed_document: Sig<["text"], "bool">;
  xml_is_well_formed_content: Sig<["text"], "bool">;

  // ───────────── function-style casts: `date(ts)`, `int8(x)`, `timestamp(d, t)` ─────────────
  bool: Sig<["..."], "bool">; int2: Sig<["..."], "int2">; int4: Sig<["..."], "int4">; int8: Sig<["..."], "int8">;
  float4: Sig<["..."], "float4">; float8: Sig<["..."], "float8">; numeric: Sig<["..."], "numeric">; money: Sig<["..."], "money">;
  date: Sig<["..."], "date">; time: Sig<["..."], "time">; timetz: Sig<["..."], "timetz">; interval: Sig<["..."], "interval">;
  timestamp: Sig<["..."], "timestamp">; timestamptz: Sig<["..."], "timestamptz">;
  bpchar: Sig<["..."], "bpchar">; char: Sig<["..."], "char">; varchar: Sig<["..."], "varchar">; name: Sig<["..."], "name">;
  bit: Sig<["..."], "bit">; varbit: Sig<["..."], "varbit">; oid: Sig<["..."], "oid">; xid: Sig<["..."], "xid">;
  regclass: Sig<["..."], "regclass">; xml: Sig<["..."], "xml">;
  cidr: Sig<["..."], "cidr">; macaddr: Sig<["..."], "macaddr">; macaddr8: Sig<["..."], "macaddr8">;
  point: Sig<["..."], "point">; lseg: Sig<["..."], "lseg">; box: Sig<["..."], "box">; path: Sig<["..."], "path">;
  polygon: Sig<["..."], "polygon">; circle: Sig<["..."], "circle">;
}

// ───────────────────────────── overload resolution ─────────────────────────────

type ToList<S> = S extends readonly AnySig[] ? S : S extends AnySig ? readonly [S] : readonly [];

/**
 * How well does actual type `A` satisfy parameter pattern `P`?
 *   "x"   exact match (counts towards the overload score)
 *   "c"   accepted through an implicit cast / polymorphic parameter / untyped literal
 *   false not accepted
 */
export type MatchKind<P extends string, A extends string> =
  A extends "unknown" | "null" ? "c"
  : A extends "lit" ? (P extends "anystring" | StrT ? "x" : "c")
  : P extends "any" | "..." ? "c"
  : P extends "anynumeric" ? (A extends NumT ? "x" : false)
  : P extends "anystring" ? (A extends StrT ? "x" : false)
  : P extends "anyarray" ? (IsArr<A> extends true ? "x" : false)
  : P extends "anyjson" ? (A extends JsonT ? "x" : false)
  : P extends "anydatetime" ? (A extends DateTimeT ? "x" : false)
  : P extends "anyrange" ? (A extends RangeT ? "x" : false)
  : A extends P ? "x"
  // callers outside the typer (FROM-clause SRFs, parameter typing) see string literals as text
  : A extends "text" ? "c"
  : P extends `${infer PE}[]` ? (A extends `${infer AE}[]` ? (MatchKind<PE, AE> extends false ? false : "c") : false)
  : P extends "int4" ? (A extends "int2" ? "c" : false)
  : P extends "int8" ? (A extends "int2" | "int4" ? "c" : false)
  : P extends "numeric" ? (A extends IntT ? "c" : false)
  : P extends "float4" ? (A extends IntT | "numeric" ? "c" : false)
  : P extends "float8" ? (A extends IntT | "numeric" | "float4" ? "c" : false)
  : P extends "text" | "varchar" | "bpchar" ? (A extends StrT ? "c" : false)
  : P extends "timestamptz" ? (A extends "date" | "timestamp" ? "c" : false)
  : P extends "timestamp" ? (A extends "date" ? "c" : false)
  : P extends "timetz" ? (A extends "time" ? "c" : false)
  : P extends "interval" ? (A extends "time" ? "c" : false)
  : P extends "inet" ? (A extends "cidr" ? "c" : false)
  : P extends "oid" | "regclass" | "regtype" | "regproc" | "regconfig" ? (A extends IntT ? "c" : false)
  : false;

/** Score of a signature against the arguments (tuple whose length is the number of exact matches), or false. */
type ArgsMatch<Ps extends readonly string[], As extends readonly ColInfo[], Score extends readonly unknown[]> =
  Ps extends readonly ["..."] ? Score
  : Ps extends readonly [infer P extends string, ...infer PR extends readonly string[]]
    ? As extends readonly [infer A extends ColInfo, ...infer AR extends readonly ColInfo[]]
      ? MatchKind<P, A["type"]> extends infer K
        ? K extends "x" ? ArgsMatch<PR, AR, [...Score, 0]> : K extends "c" ? ArgsMatch<PR, AR, Score> : false
        : never
      : false
    : As extends readonly [] ? Score : false;

/** Best-scoring overload (ties → earlier), or null. */
type BestSig<Sigs extends readonly AnySig[], As extends readonly ColInfo[], Best, BestScore extends readonly unknown[]> =
  Sigs extends readonly [infer S extends AnySig, ...infer R extends readonly AnySig[]]
    ? ArgsMatch<S["args"], As, []> extends infer K
      ? K extends readonly unknown[]
        ? Best extends null ? BestSig<R, As, S, K>
        : K extends readonly [...BestScore, unknown, ...unknown[]] ? BestSig<R, As, S, K>
        : BestSig<R, As, Best, BestScore>
        : BestSig<R, As, Best, BestScore>
      : never
    : Best;

/** First overload whose arity fits (used when no overload matches by type). */
type ArityFallback<Sigs extends readonly AnySig[], As extends readonly ColInfo[]> =
  Sigs extends readonly [infer S extends AnySig, ...infer R extends readonly AnySig[]]
    ? ArityOk<S["args"], As> extends true ? S : ArityFallback<R, As>
    : null;
type ArityOk<Ps extends readonly string[], As extends readonly ColInfo[]> =
  Ps extends readonly [...infer Fixed extends readonly string[], "..."]
    ? As extends readonly [...{ [K in keyof Fixed]: unknown }, ...unknown[]] ? true : false
    : Ps["length"] extends As["length"] ? true : false;

/** Resolve a catalog entry against argument types: the chosen `Sig`, or null. */
export type PickSig<Sigs, As extends readonly ColInfo[]> =
  BestSig<ToList<Sigs>, As, null, []> extends infer S
    ? S extends AnySig ? S : ArityFallback<ToList<Sigs>, As>
    : never;

// ───────────────────────────── return types ─────────────────────────────

/** Type of argument `I` (a string literal resolves to text). */
type TypeAt<As extends readonly ColInfo[], I extends number> = As[I] extends ColInfo ? LitToText<As[I]["type"]> : "unknown";
type CommonOf<As extends readonly ColInfo[], Acc extends string> =
  As extends readonly [infer A extends ColInfo, ...infer R extends readonly ColInfo[]] ? CommonOf<R, CommonLit<Acc, A["type"]>> : LitToText<Acc>;

/** Element type of an array, or the range type of a multirange. */
type ElemOf<T extends string> = T extends `${infer E}[]` ? E : T extends `${infer X}multirange` ? `${X}range` : "unknown";
/** Array of `T`; Postgres has no arrays of arrays, so `T[]` stays `T[]`. */
type ArrOf<T extends string> = T extends `${string}[]` ? T : T extends "unknown" | "null" ? "unknown[]" : `${T}[]`;
type RangeSubtype = { int4: "int4"; int8: "int8"; num: "numeric"; ts: "timestamp"; tstz: "timestamptz"; date: "date" };
type RangeElem<T extends string> =
  T extends `${infer X}multirange` ? (X extends keyof RangeSubtype ? RangeSubtype[X] : "unknown")
  : T extends `${infer X}range` ? (X extends keyof RangeSubtype ? RangeSubtype[X] : "unknown")
  : "unknown";
type MultirangeOf<T extends string> = T extends `${string}multirange` ? T : T extends `${infer X}range` ? `${X}multirange` : "unknown";

/** Call context needed for return type and nullability. */
export type CallCtx = {
  readonly grouped: boolean;
  readonly over: boolean;
  readonly filter: boolean;
  readonly distinct: boolean;
  readonly hasStar: boolean;
  /** Type of the `WITHIN GROUP (ORDER BY e)` expression, or "unknown". */
  readonly wg: string;
};
type DefaultCtx = { grouped: false; over: false; filter: false; distinct: false; hasStar: false; wg: "unknown" };

type Ret<R extends string, As extends readonly ColInfo[], C extends CallCtx> =
  R extends `$${string}`
    ? R extends "$1" ? TypeAt<As, 0>
    : R extends "$2" ? TypeAt<As, 1>
    : R extends "$3" ? TypeAt<As, 2>
    : R extends "$4" ? TypeAt<As, 3>
    : R extends "$elem1" ? ElemOf<TypeAt<As, 0>>
    : R extends "$arr1" ? ArrOf<TypeAt<As, 0>>
    : R extends "$common" ? CommonOf<As, "unknown">
    : R extends "$rangeelem1" ? RangeElem<TypeAt<As, 0>>
    : R extends "$multirange1" ? MultirangeOf<TypeAt<As, 0>>
    : R extends "$wg" ? C["wg"]
    : R extends "$wgarr" ? ArrOf<C["wg"]>
    : R extends "$pct" ? (C["wg"] extends "interval" ? "interval" : "float8")
    : R extends "$pctarr" ? (C["wg"] extends "interval" ? "interval[]" : "float8[]")
    : R extends `$j${infer P}` ? JsonRet<P, As>
    : R
  : R;

// ───────────────────────────── nullability ─────────────────────────────

type AnyNullable<As extends readonly ColInfo[]> =
  As extends readonly [infer A extends ColInfo, ...infer R extends readonly ColInfo[]] ? (A["nullable"] extends true ? true : AnyNullable<R>) : false;
type AllNullable<As extends readonly ColInfo[]> =
  As extends readonly [] ? true
  : As extends readonly [infer A extends ColInfo, ...infer R extends readonly ColInfo[]] ? (A["nullable"] extends true ? AllNullable<R> : false) : true;
type Prev = { 1: 0; 2: 1; 3: 2; 4: 3; 5: 4; 6: 5; 7: 6; 8: 7 };
/** Any of the 1-based argument positions `Idx` nullable? */
type AnyNullableAt<As extends readonly ColInfo[], Idx extends readonly number[]> =
  Idx extends readonly [infer I extends keyof Prev, ...infer R extends readonly number[]]
    ? As[Prev[I]] extends { readonly nullable: true } ? true : AnyNullableAt<As, R>
    : false;

/**
 * Nullability of a resolved call:
 *   nullable: false/true → as flagged
 *   aggregate → FILTER makes it nullable; as a window function only its arguments do;
 *               ungrouped (empty input → NULL) → nullable; else its arguments
 *   strict: true → any argument nullable; false → all arguments nullable; [i, j] → those arguments
 */
type CallNullable<S extends AnySig, As extends readonly ColInfo[], C extends CallCtx> =
  S["nullable"] extends false ? false
  : S["nullable"] extends true ? true
  : S["agg"] extends true
    ? C["filter"] extends true ? true
    : C["over"] extends true ? (S["strict"] extends false ? false : AnyNullable<As>)
    : C["grouped"] extends false ? true
    : S["strict"] extends false ? false
    : AnyNullable<As>
  : S["strict"] extends false ? AllNullable<As>
  : S["strict"] extends readonly number[] ? AnyNullableAt<As, S["strict"]>
  : AnyNullable<As>;

/** Functions a schema declares under `$functions` (`{}` when none). */
type SchemaFunctions<DB> = DB extends { readonly $functions: infer F } ? F : {};

/**
 * Catalog entry of a function name, or null when Postgres would not know it:
 * `FunctionCatalog` (built-ins and augmentations), then the schema's `$functions`, then the
 * generated `PgFunctions`. Schema qualification is dropped by the parser (`public.f` → `f`).
 */
export type LookupFn<DB, Name extends string> =
  Name extends keyof FunctionCatalog ? FunctionCatalog[Name]
  : Name extends keyof SchemaFunctions<DB> ? SchemaFunctions<DB>[Name]
  : Name extends keyof PgFunctions ? PgFunctions[Name]
  : null;

/**
 * `function f(text, int4) does not exist`, worded like Postgres (untyped literals show as
 * `unknown`). `Reposition` adds a "Perhaps you meant" hint (suggest.ts).
 */
export type UnknownFunction<Name extends string, As extends readonly ColInfo[]> =
  SqlError<`function ${Name}(${ArgList<As, "">}) does not exist. Declare it in the schema's $functions or in FunctionCatalog`, null>;
type ArgList<As extends readonly ColInfo[], Acc extends string> =
  As extends readonly [infer A extends ColInfo, ...infer R extends readonly ColInfo[]]
    ? ArgList<R, `${Acc}${Acc extends "" ? "" : ", "}${A["type"] extends "lit" | "null" ? "unknown" : A["type"]}`>
    : Acc;

/**
 * Type a function call. A name that resolves but whose overloads do not fit the arguments →
 * `{ unknown, nullable }` (a cast fixes it); an unknown name is an error.
 */
export type CallType<Name extends string, As extends readonly ColInfo[], C extends CallCtx, DB = {}> =
  LookupFn<DB, Name> extends infer O
    ? O extends null ? UnknownFunction<Name, As>
    : PickSig<O, As> extends infer S
      ? S extends AnySig ? Info<Ret<S["ret"], As, C>, CallNullable<S, As, C>> : Info<"unknown", true>
      : never
    : never;

/** Is `name` a catalog function with an aggregate overload? */
export type IsAggregate<Name extends string> =
  Name extends keyof FunctionCatalog ? HasAgg<ToList<FunctionCatalog[Name]>> : false;
type HasAgg<Sigs extends readonly AnySig[]> =
  Sigs extends readonly [infer S extends AnySig, ...infer R extends readonly AnySig[]] ? (S["agg"] extends true ? true : HasAgg<R>) : false;

/** Set-returning function result element type for FROM, or null if not an SRF. */
export type SrfType<Name extends string, As extends readonly ColInfo[], DB = {}> =
  LookupFn<DB, Name> extends infer O
    ? O extends null ? null
    : PickSig<O, As> extends infer S
      ? S extends AnySig & { readonly srf: true } ? Info<Ret<S["ret"], As, DefaultCtx>, S["nullable"] extends true ? true : AnyNullable<As>> : null
      : never
    : never;
