import type { RowType } from "typesql";
import { check, type Equal } from "./_check.js";
import type { DB } from "./schema.js";

// #region custom
import { createSql, type DefaultTypeMap } from "typesql";

interface MyMap extends Omit<DefaultTypeMap, "int8"> {
  int8: number; // you registered an int8 parser that returns numbers
  "int8[]": number[]; // an exact entry wins over the element-wise array mapping
}
const sql = createSql<DB, MyMap>();
const counts = sql("SELECT author_id, count(*) AS n FROM posts GROUP BY author_id");
// { author_id: number; n: number }
// #endregion custom
check<Equal<RowType<typeof counts>, { author_id: number; n: number }>>();
