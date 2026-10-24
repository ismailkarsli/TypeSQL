import type { ParamsType, RowType } from "@typesql/core";
import { check, type Equal } from "./_check.js";
import type { DB } from "./schema.js";

// #region custom
import { createSql, type DefaultTypeMap } from "@typesql/core";

interface MyMap extends Omit<DefaultTypeMap, "int8"> {
	int8: number; // you registered an int8 parser that returns numbers
	"int8[]": number[]; // an exact entry wins over the element-wise array mapping
}
const sql = createSql<DB, MyMap>();
const counts = sql(
	"SELECT author_id, count(*) AS n FROM posts GROUP BY author_id",
);
// { author_id: number; n: number }
// #endregion custom
check<Equal<RowType<typeof counts>, { author_id: number; n: number }>>();

// #region params
import type { DefaultParamTypeMap } from "@typesql/core";

/** Your own value class; node-postgres sends it through `toPostgres()`. */
declare class Instant {
	toPostgres(): string;
}
interface AppParams extends Omit<DefaultParamTypeMap, "timestamptz"> {
	timestamptz: Date | string | Instant;
}
interface AppMap extends Omit<DefaultTypeMap, "timestamptz"> {
	timestamptz: string; // a parser that formats timestamps
	$params: AppParams;
}
const app = createSql<DB, AppMap>();
const recent = app(
	"SELECT id, created_at FROM users WHERE created_at > $1",
	new Date(),
);
// Query<{ id: number; created_at: string }, [string | Date | Instant | null]>
// #endregion params
check<Equal<RowType<typeof recent>, { id: number; created_at: string }>>();
check<Equal<ParamsType<typeof recent>, [string | Date | Instant | null]>>();
