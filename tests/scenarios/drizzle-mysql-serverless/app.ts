import { connect } from "@tidbcloud/serverless";
import { mysql } from "@typesql/core/mysql";
import { createSql } from "@typesql/drizzle";
import { drizzle } from "drizzle-orm/tidb-serverless";

// The real client over a fake transport: what reaches TiDB is what it was sent.
const sent: unknown[] = [];
const client = connect({
	url: "mysql://user:secret@tidb.invalid/app",
	fetch: async (_url, init) => {
		sent.push(JSON.parse(String(init?.body)).query);
		return new Response(
			JSON.stringify({ types: [], rows: [], rowsAffected: 0 }),
			{ headers: { "TiDB-Session": "session" } },
		);
	},
});
const sql = createSql(mysql, drizzle({ client }));

// A `?` in a string is text, whichever side of a parameter it is on.
await sql("SELECT 'why?' AS note, $1 AS id", 7).execute();
await sql("SELECT $1 AS quoted, 'why?' AS note", "it's").execute();
await sql("SELECT 1 AS plain").execute();
console.dir(sent, { depth: null });
