import type { DB } from "./schema.js";

// `--exclude "drafts, Logs_*"` leaves out both patterns, spaces trimmed.
export type Tables = keyof DB;
