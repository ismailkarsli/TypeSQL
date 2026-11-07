import type { Col } from "@typesql/core/postgres";

export interface DB {
	users: {
		id: Col<"int4">;
		name: Col<"text">;
		email: Col<"text", { nullable: true }>;
		active: Col<"bool", { hasDefault: true }>;
	};
	posts: {
		id: Col<"int4">;
		author_id: Col<"int4">;
		title: Col<"text", { nullable: true }>;
		created_at: Col<"timestamptz", { hasDefault: true }>;
	};
}
