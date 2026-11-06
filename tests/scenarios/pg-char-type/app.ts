import { createSql, type RowType } from "@typesql/core";
import { type ApplyDdl, type Col, postgres } from "@typesql/core/postgres";

// "char" is PostgreSQL's one-byte type, as introspection writes it; bpchar is
// char(n), which SQL spells char or character.
interface Introspected {
	t: { flag: Col<"char">; code: Col<"bpchar"> };
}
type Created = ApplyDdl<
	Record<never, never>,
	`CREATE TABLE t (flag "char" NOT NULL, code char(2) NOT NULL)`
>;

const introspected = createSql<Introspected>(postgres);
const created = createSql<Created>(postgres);

const rows = introspected("SELECT flag, code FROM t");
export type Rows = RowType<typeof rows>;
const createdRows = created("SELECT flag, code FROM t");
export type CreatedRows = RowType<typeof createdRows>;

// A call no overload takes names the argument types in its message.
introspected("SELECT upper(flag, 1) FROM t");
introspected("SELECT upper(code, 1) FROM t");
created("SELECT upper(flag, 1) FROM t");
created("SELECT upper(code, 1) FROM t");
introspected(`SELECT upper("char" 'a', 1)`);
introspected("SELECT upper(char 'a', 1)");
introspected(`SELECT upper('a'::"char", 1)`);
