import type { IntrospectConfig } from "@typesql/pg/introspect";

export default {
	functionNotNull: (fn) => fn.name === "greet",
} satisfies IntrospectConfig;
