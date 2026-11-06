import { createSql } from "@typesql/core";
import { type DefaultTypeMap, type Json, sqlite } from "@typesql/core/sqlite";

interface DB {
	posts: {
		meta: Json<{ theme: string }>;
		extra: Json<{ tags: string[] }, { nullable: true }>;
	};
}
// SQLite drivers return JSON as text, which the default map says.
const text = createSql<DB>(sqlite)("SELECT meta, extra FROM posts");
export type Text = Awaited<ReturnType<typeof text.execute>>;

// An executor that returns JSON parsed says so in its map; a typed JSON
// column then reads as its type.
interface ParsedJsonTypeMap extends Omit<DefaultTypeMap, "json"> {
	json: unknown;
}
const parsed = createSql<DB, ParsedJsonTypeMap>(sqlite)(
	"SELECT meta, extra FROM posts",
);
export type Parsed = Awaited<ReturnType<typeof parsed.execute>>;
