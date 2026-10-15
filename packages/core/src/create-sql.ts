import type { ParamsOf, RowOf, Validate } from "./engine/infer.js";
import type { NamedParams, RewriteNamedStr } from "./engine/named.js";
import type { AnyErr, SqlError } from "./engine/errors.js";
import type { CheckCarried, Enc, InlineMarker, RewriteInlineStr, Skip } from "./engine/inline.js";
import type { HasSlots, JoinedText, MaxParamStr, QuotedIdent, SlotNames, Splice, SpliceCarried, Take, UnknownTuple } from "./engine/splice.js";
import type { DefaultTypeMap } from "./type-map/index.js";
import { makeFragment, makeQuery, type CARRIED, type Executor, type Fragment, type Query, type TextType } from "./query.js";
import { joinFragments, maxParam, quoteIdent, rewriteNamed, splice, type Spliceable } from "./runtime/splice.js";
import { hasInline, param, resolveInline } from "./runtime/inline.js";

/** Fragments accepted in a slot object: fragments or whole queries (subqueries). */
export type Slottable = Fragment<string, readonly unknown[], readonly unknown[]> | Query<unknown, readonly unknown[], string>;
export type SlotMap = { readonly [name: string]: Slottable };

/** Slot object required by a query literal: one fragment per `{name}`. */
export type SlotsFor<Q extends string, S> = { readonly [K in SlotNames<Q>]: K extends keyof S ? S[K] : Slottable };

/** Texts of the slot fragments, as literals when known. */
type SlotTexts<S> = { readonly [K in keyof S]: { readonly text: TextType<S[K]> } };

/**
 * Encoded value types a fragment carries, one per `$n`. Queries spliced as subqueries carry
 * none (their values were checked by their own `sql()` call); untyped fragments carry none.
 */
type CarriedOf<F> =
  F extends { readonly [CARRIED]?: infer C }
    ? C extends readonly unknown[] ? (number extends C["length"] ? Skip<MaxParamStr<TextType<F>>> : C) : Skip<MaxParamStr<TextType<F>>>
    : Skip<MaxParamStr<TextType<F>>>;
type SlotCarried<S> = { readonly [K in keyof S]: CarriedOf<S[K]> };

// ───────────────────────────── call-site text processing ─────────────────────────────

/** A plain string literal (or a union of them); `string` and template types with holes are not. */
type IsLiteral<Q extends string> = string extends Q ? false : {} extends Record<Q, 1> ? false : true;

/**
 * Error for non-literal SQL text. Written out at each use (not through an alias) so the
 * editor shows the message rather than an alias name.
 */
type NotLiteralMessage = "the SQL text is not a string literal: pass values as parameters ($1, :name or ${sql.param(value)}), identifiers with sql.id(), reusable pieces as {slot} fragments, or use sql.as<Row>() for dynamic SQL";

/**
 * `:name` → `$k` (first appearance), then `${sql.param(v)}` markers → `$k` after those.
 * `[text, names, inlineEncodings, count]` where `count` is the number of parameters supplied
 * as call arguments (`$n` max or distinct names), or an SqlError.
 */
type Prepared<Q extends string> =
  RewriteNamedStr<Q> extends [infer T1 extends string, infer Names extends string[]]
    ? Names extends []
      ? WithInline<T1, Names, MaxParamStr<T1>>
      : MaxParamStr<Q> extends 0 ? WithInline<T1, Names, Names["length"]> : SqlError<"cannot mix named (:name) and positional ($n) parameters", null>
    : never;
type WithInline<T1 extends string, Names extends string[], M extends number> =
  RewriteInlineStr<T1, M> extends infer R
    ? R extends [infer T2 extends string, infer Encs extends string[]] ? [T2, Names, Encs, M] : R
    : never;

/** The positional text of a call (what is validated and sent). */
type PText<Q extends string> = Prepared<Q> extends [infer X extends string, ...unknown[]] ? X : Q;

/** Arguments after the query (or after the slots): positional values or one `:name` object. */
type ArgsFor<DB, TM, X extends string, Names extends string[], Encs extends readonly unknown[], M extends number> =
  Names extends []
    ? Encs extends readonly [] ? ParamsOf<DB, TM, X> : Take<ParamsOf<DB, TM, X>, M>
    : [params: NamedParams<Names, Take<ParamsOf<DB, TM, X>, Names["length"]>>];

/** `unknown` when the call is valid; otherwise the SqlError (so it lands on the query literal). */
type CallCheck<DB, TM, Q extends string> =
  IsLiteral<Q> extends false ? SqlError<NotLiteralMessage, 0>
  : HasSlots<Q> extends true ? never
  : Prepared<Q> extends infer P
    ? P extends [infer X extends string, string[], infer Encs extends readonly string[], infer M extends number]
      ? Validate<DB, X> extends infer V
        ? V extends AnyErr ? V : Carried<DB, TM, X, [...Skip<M>, ...Encs]>
        : never
      : P
    : never;
type CallArgs<DB, TM, Q extends string> =
  IsLiteral<Q> extends false ? readonly unknown[]
  : Prepared<Q> extends [infer X extends string, infer Names extends string[], infer Encs extends readonly string[], infer M extends number]
    ? ArgsFor<DB, TM, X, Names, Encs, M>
    : readonly unknown[];

/** `unknown` when every carried value type fits its parameter, else the SqlError. */
type Carried<DB, TM, X extends string, K extends readonly unknown[]> =
  K extends readonly null[] ? unknown : CheckCarried<DB, TM, X, K> extends infer C ? (C extends true ? unknown : C) : never;

// ─── with slots ───

/** The fully spliced literal (or an SqlError / `string` for dynamic fragments). */
export type SplicedText<Q extends string, S> = Splice<PText<Q>, SlotTexts<S>>;

type SlottedCheck<DB, TM, Q extends string, S> =
  IsLiteral<Q> extends false ? SqlError<NotLiteralMessage, 0>
  : Prepared<Q> extends infer P
    ? P extends [infer T2 extends string, string[], infer Encs extends readonly string[], infer M extends number]
      ? Splice<T2, SlotTexts<S>> extends infer X
        ? X extends string
          ? string extends X ? SqlError<"dynamic SQL fragment: the statement text is not a literal; use sql.as<Row>() to assert the row type", null>
          : Validate<DB, X> extends infer V
            ? V extends AnyErr ? V : Carried<DB, TM, X, [...Skip<M>, ...Encs, ...SpliceCarried<T2, SlotCarried<S>>]>
            : never
          : X
        : never
      : P
    : never;
type SlottedArgs<DB, TM, Q extends string, S> =
  IsLiteral<Q> extends false ? readonly unknown[]
  : Prepared<Q> extends [infer T2 extends string, infer Names extends string[], readonly unknown[], infer M extends number]
    ? Splice<T2, SlotTexts<S>> extends infer X extends string
      ? Names extends [] ? Take<ParamsOf<DB, TM, X>, M> : [params: NamedParams<Names, Take<ParamsOf<DB, TM, X>, Names["length"]>>]
      : readonly unknown[]
    : readonly unknown[];
type SplicedOr<Q extends string, S> = SplicedText<Q, S> extends infer X extends string ? X : string;

// ─── fragments ───

type FragCheck<Text extends string, Slotted extends boolean> =
  IsLiteral<Text> extends false ? SqlError<NotLiteralMessage, 0>
  : HasSlots<Text> extends Slotted
    ? Prepared<Text> extends infer P ? (P extends AnyErr ? P : unknown) : never
    : never;
/**
 * Arguments to `sql.fragment`: positional values for its `$n`, or one `:name` object. Applied as
 * `...params: A & BoxFragArgs<Text>` with `A` unconstrained: a constraint that goes through
 * `Prepared` cannot be resolved during inference, and TS would replace `A` by the constraint.
 */
type FragArgs<Text extends string> =
  Prepared<Text> extends [string, infer Names extends string[], readonly unknown[], infer M extends number]
    ? Names extends [] ? UnknownTuple<M> : [params: { readonly [K in Names[number]]: unknown }]
    : readonly unknown[];
type FragCount<Text extends string> =
  Prepared<Text> extends [string, string[], infer Encs extends readonly unknown[], infer M extends number] ? [...UnknownTuple<M>, ...Encs]["length"] : 0;
/** Encoded types of the values a fragment carries: its arguments, then its inline params. */
type FragCarried<Text extends string, A extends readonly unknown[]> =
  Prepared<Text> extends [string, infer Names extends string[], infer Encs extends readonly string[], number]
    ? Names extends [] ? [...EncAll<A>, ...Encs] : [...EncNamed<Names, A[0]>, ...Encs]
    : [];
type EncAll<A extends readonly unknown[]> = { -readonly [I in keyof A]: Enc<A[I]> };
type EncNamed<Names extends string[], O> = { [I in keyof Names]: Names[I] extends keyof O ? Enc<O[Names[I]]> : "*" };
type JoinedCarried<Items extends readonly unknown[], Acc extends readonly unknown[] = []> =
  Items extends readonly [infer H, ...infer R] ? JoinedCarried<R, [...Acc, ...(CarriedOf<H> extends infer C extends readonly unknown[] ? C : [])]> : Acc;

type GateCallCheck<DB, TM, Q extends string> = [DB, TM, Q] extends [infer D, infer M, infer Q2 extends string] ? CallCheck<D, M, Q2> : never;
type GateSlottedCheck<DB, TM, Q extends string, S> =
  [DB, TM, Q, S] extends [infer D, infer M, infer Q2 extends string, infer S2] ? SlottedCheck<D, M, Q2, S2> : never;
type GateFragCheck<Text extends string, Slotted extends boolean> =
  [Text, Slotted] extends [infer T2 extends string, infer B extends boolean] ? FragCheck<T2, B> : never;
type BoxCallArgs<DB, TM, Q extends string> = Extract<{ [K in Q as `${K}`]: CallArgs<DB, TM, K> }[`${Q}`], readonly unknown[]>;
type BoxSlottedArgs<DB, TM, Q extends string, S> = Extract<{ [K in Q as `${K}`]: SlottedArgs<DB, TM, K, S> }[`${Q}`], readonly unknown[]>;
type BoxFragArgs<Text extends string> = Extract<{ [K in Text as `${K}`]: FragArgs<K> }[`${Text}`], readonly unknown[]>;

/**
 * The typed SQL function returned by `createSql<DB, TypeMap>()`.
 *
 *   sql("SELECT id FROM users WHERE id = $1", 42)                  → Query<{ id: number }, [number]>
 *   sql("SELECT id FROM users WHERE id = :id", { id: 42 })         → named parameters (rewritten to $n)
 *   sql(`SELECT id FROM users WHERE id = ${sql.param(42)}`)        → inline parameters (rewritten to $n)
 *   sql("SELECT u.id FROM users u {where}", { where }, ...outer)   → fragments spliced before inference
 *
 * On an invalid statement the `query` argument's type becomes `SqlError<"...", position>`,
 * so the compile error lands on the SQL text.
 */
export interface Sql<DB, TM> {
  <const Q extends string>(query: Q & GateCallCheck<DB, TM, Q>, ...params: BoxCallArgs<DB, TM, Q>): Query<RowOf<DB, TM, PText<Q>>, ParamsOf<DB, TM, PText<Q>>, PText<Q>>;
  <const Q extends string, const S extends SlotMap>(
    query: Q & GateSlottedCheck<DB, TM, Q, S>,
    slots: S & SlotsFor<Q, S>,
    ...params: BoxSlottedArgs<DB, TM, Q, S>
  ): Query<RowOf<DB, TM, SplicedOr<Q, S>>, ParamsOf<DB, TM, SplicedOr<Q, S>>, SplicedOr<Q, S>>;

  /** Escape hatch: bypass inference and assert the row type. Accepts slots, `:name` and inline params like the main call. */
  as<Row>(query: string, ...params: readonly unknown[]): Query<Row, readonly unknown[]>;
  as<Row>(query: string, slots: SlotMap, ...params: readonly unknown[]): Query<Row, readonly unknown[]>;

  /**
   * Bind a value inline: `` sql(`… WHERE id = ${sql.param(userId)}`) ``. The value becomes a
   * `$n` parameter (never text) and its type is checked against the parameter's context.
   */
  param<const T>(value: T): InlineMarker<T>;

  /**
   * A spliceable SQL piece (not validated on its own; its parameters are typed once spliced).
   * `:name` and inline parameters are resolved at creation, so a fragment can be reused; the
   * values' types are checked when the fragment is spliced.
   */
  fragment<const Text extends string, const A extends readonly unknown[]>(text: Text & GateFragCheck<Text, false>, ...params: A & BoxFragArgs<Text>): Fragment<PText<Text>, UnknownTuple<FragCount<Text>>, FragCarried<Text, A>>;
  fragment<const Text extends string, const S extends SlotMap, const A extends readonly unknown[]>(
    text: Text & GateFragCheck<Text, true>,
    slots: S & SlotsFor<Text, S>,
    ...params: A & BoxFragArgs<Text>
  ): Fragment<SplicedOr<Text, S>, readonly unknown[], [...FragCarried<Text, A>, ...SpliceCarried<PText<Text>, SlotCarried<S>>]>;

  /** Quoted identifier fragment: `sql.id("col")` → `"col"`, `sql.id("s", "t")` → `"s"."t"`. */
  id<const Parts extends readonly [string, ...string[]]>(...parts: Parts): Fragment<QuotedIdent<Parts>, [], []>;

  /** Join fragments with a separator; a tuple input keeps the literal text, an array yields a dynamic fragment. */
  join<const Items extends readonly Slottable[], const Sep extends string = ", ">(items: Items, separator?: Sep): Fragment<JoinedText<SlotTexts<Items> extends readonly { readonly text: string }[] ? SlotTexts<Items> : never, Sep>, readonly unknown[], JoinedCarried<Items>>;

  /** Raw, untyped SQL text. Splicing it forces the override path (`sql.as`). */
  raw(text: string): Fragment<string, [], []>;
}

function isSlotMap(v: unknown): v is SlotMap {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  for (const x of Object.values(v as Record<string, unknown>)) {
    if (x === null || typeof x !== "object" || typeof (x as Spliceable).text !== "string" || !Array.isArray((x as Spliceable).values)) return false;
  }
  return true;
}

const SLOT_RE = /\{[A-Za-z_][A-Za-z0-9_]*\}/;
const NAMED_RE = /(^|[^:]):[A-Za-z_]/;

/**
 * Same order as the types: `:name` → `$1..$k`, inline params → `$k+1…`, then fragments are
 * spliced with their parameters renumbered after those.
 */
function build(text: string, rest: readonly unknown[]): { text: string; values: unknown[] } {
  let slots: SlotMap | null = null;
  let outer: readonly unknown[] = rest;
  if (SLOT_RE.test(text) && rest.length > 0 && isSlotMap(rest[0])) {
    slots = rest[0];
    outer = rest.slice(1);
  }
  let positional = text;
  let values: unknown[] = [...outer];
  if (NAMED_RE.test(text)) {
    const rn = rewriteNamed(text);
    if (rn.names.length > 0) {
      const obj = outer[0];
      if (outer.length !== 1 || obj === null || typeof obj !== "object") {
        throw new Error("typesql: a statement with :name parameters takes exactly one object argument");
      }
      const record = obj as Record<string, unknown>;
      values = rn.names.map((n) => {
        if (!(n in record)) throw new Error(`typesql: missing named parameter :${n}`);
        return record[n];
      });
      positional = rn.text;
    }
  }
  if (hasInline(positional)) {
    const r = resolveInline(positional, Math.max(maxParam(positional), values.length));
    positional = r.text;
    values = [...values, ...r.values];
  }
  return slots ? splice(positional, slots, values) : { text: positional, values };
}

/** `executor`, when given, is what the queries' `execute*` methods run on by default. */
export function createSql<DB, TM = DefaultTypeMap>(executor?: Executor): Sql<DB, TM> {
  const call = (query: string, ...rest: readonly unknown[]) => {
    const { text, values } = build(query, rest);
    return makeQuery(text, values, executor);
  };
  const api = Object.assign(call, {
    as: (query: string, ...rest: readonly unknown[]) => {
      const { text, values } = build(query, rest);
      return makeQuery(text, values, executor);
    },
    param,
    fragment: (text: string, ...rest: readonly unknown[]) => {
      const r = build(text, rest);
      return makeFragment(r.text, r.values);
    },
    id: (...parts: readonly string[]) => makeFragment(quoteIdent(...parts), []),
    join: (items: readonly Spliceable[], separator: string = ", ") => {
      const r = joinFragments(items, separator);
      return makeFragment(r.text, r.values);
    },
    raw: (text: string) => {
      const r = build(text, []);
      return makeFragment(r.text, r.values);
    },
  });
  return api as unknown as Sql<DB, TM>;
}
