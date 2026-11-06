import { createSql, type RowType } from "@typesql/core";
import { type Col, postgres, type Sig } from "@typesql/core/postgres";

interface DB {
	t: { id: Col<"int4"> };
	$types: { mood: "happy" | "sad" };
	$functions: { slugify: Sig<["text"], "text"> };
}
const sql = createSql<DB>(postgres);

const rows = sql("SELECT id FROM t");
export type Rows = RowType<typeof rows>;

// The schema's declarations are no relations.
sql(`SELECT 1 FROM "$types"`);
sql(`SELECT 1 FROM "$functions"`);
sql(`SELECT $1::int AS n FROM "$nullParams"`);
sql(`INSERT INTO "$types" VALUES (1)`);
sql(`DELETE FROM "$functions"`);
sql(`SELECT 1 FROM "$types".mood`);
sql(`UPDATE "$types".mood SET x = 1`);
