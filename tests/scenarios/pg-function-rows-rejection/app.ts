import { createSql } from "@typesql/core";
import { type Col, postgresDialect, type Sig } from "@typesql/core/postgres";

interface DB {
	users: { id: Col<"int4">; name: Col<"text"> };
	$functions: {
		// RETURNS SETOF record with no columns declared.
		pairs: Sig<[], "record", { srf: true }>;
	};
}
const sql = createSql<DB>(postgresDialect);
sql("SELECT * FROM pairs() p");
