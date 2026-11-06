import { createSql, type RowType } from "@typesql/core";
import { type Col, postgres } from "@typesql/core/postgres";

interface DB {
	t: {
		label: Col<"text">;
		at: Col<"time">;
		span: Col<"interval">;
		o: Col<"oid">;
		rc: Col<"regclass">;
		maybe_o: Col<"oid", { nullable: true }>;
	};
	u: { o: Col<"regclass"> };
}
const sql = createSql<DB>(postgres);

// Of two types that convert to each other, the first one is kept.
const kept = sql(
	"SELECT coalesce(o, rc) AS oid_first, coalesce(rc, o) AS regclass_first, coalesce(maybe_o, rc) AS nullable_first FROM t",
);
export type Kept = RowType<typeof kept>;
const joined = sql("SELECT o FROM t JOIN u USING (o)");
export type Joined = RowType<typeof joined>;

// An implicit cast to another category gives no common type.
sql(`SELECT coalesce('a'::"char", label) FROM t`);
sql("SELECT CASE WHEN true THEN at ELSE span END FROM t");
