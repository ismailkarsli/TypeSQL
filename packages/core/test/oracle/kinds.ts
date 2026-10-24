export const KINDS = ["unsound", "rejects", "accepts", "imprecise", "unsound-candidate", "parse", "crash"] as const;
export type Kind = (typeof KINDS)[number];

export const NEEDS_ISSUE: ReadonlySet<string> = new Set<Kind>(["unsound", "unsound-candidate"]);

export interface Disagreement {
  readonly kind: Kind;
  readonly detail: string;
}

export type SkipReason =
  | "slots"
  | "schema-unrepresentable"
  | "needs-context"
  | "server-error"
  | "replay-diverged"
  | "psql-variable"
  | "nonstandard-strings"
  | "view-refused"
  | "data-dependent"
  | "schema-constraints"
  | "multi-statement"
  | "invalid-input"
  | "outcome-unknown"
  | "aborted-transaction"
  | "replay-aborted"
  | "not-applied"
  | "unreadable-result"
  | (string & {});
