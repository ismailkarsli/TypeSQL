import { hashOf, preview, type BaselineEntry, type Entries } from "./baseline.js";
import type { Disagreement, SkipReason } from "./kinds.js";

export interface OracleResult {
  readonly entries: Entries;
  readonly tally: { [outcome: string]: number };
  readonly notes: string[];
}

export type Verdict = { readonly disagreements: readonly Disagreement[] } | { readonly skip: SkipReason };

export const emptyResult = (): OracleResult => ({ entries: {}, tally: {}, notes: [] });

export function count(r: OracleResult, outcome: string, n = 1): void {
  r.tally[outcome] = (r.tally[outcome] ?? 0) + n;
}

export function record(r: OracleResult, group: string, text: string, v: Verdict, fields: { readonly line?: number } = {}, debug?: unknown): void {
  if ("skip" in v) {
    count(r, `skip: ${v.skip}`);
    if (process.env["TYPESQL_ORACLE_DEBUG"]) console.log("SKIP", JSON.stringify({ group, text, skip: v.skip, debug }));
    return;
  }
  if (!v.disagreements.length) return count(r, "agree");
  const byKind = new Map<string, Disagreement[]>();
  for (const d of v.disagreements) (byKind.get(d.kind) ?? byKind.set(d.kind, []).get(d.kind)!).push(d);
  for (const [kind, ds] of byKind) {
    count(r, kind);
    const entry: BaselineEntry = { ...fields, kind, hash: hashOf(text), detail: ds.map((d) => d.detail).join("; ").slice(0, 400), sql: preview(text) };
    if (process.env["TYPESQL_ORACLE_DEBUG"]) console.log("DEBUG", JSON.stringify({ group, text, detail: entry.detail, debug }));
    (r.entries[group] ??= []).push(entry);
  }
}
