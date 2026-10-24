import type { RowType } from "@typesql/core";
import { check, type Equal } from "./_check.js";
import { sql } from "./schema.js";

// @ts-expect-error column "emial" does not exist. Perhaps you meant the column "email"?
sql("SELECT emial FROM users");
// @ts-expect-error Argument of type 'string' is not assignable to parameter of type 'number'.
sql("SELECT id FROM users WHERE id = $1", "7");

// #region as
const page = sql.as<{ id: number; email: string }>("FETCH 10 FROM user_cursor");
// #endregion as
check<Equal<RowType<typeof page>, { id: number; email: string }>>();
