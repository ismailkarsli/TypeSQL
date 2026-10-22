import type { IntrospectConfig } from "../../src/introspect/index.js";

/** `typesql introspect --config` for the fixture database (see fixture.ts). */
export default {
  schemas: ["public", "auth"],
  imports: ['import type { HistoryItem, Settings } from "./json-types.js";'],
  columnTypes: {
    "users.history": "HistoryItem[]",
    "users.settings": "Settings",
    "public.events.payload": "{ kind: string }",
  },
} satisfies IntrospectConfig;
