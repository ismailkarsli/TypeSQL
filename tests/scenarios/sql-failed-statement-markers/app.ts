import { createSql } from "@typesql/sqlite";

const sql = createSql<{}>();
// A statement that fails has used its sql.param() values, as one that runs has.
const statement: string = `SELECT ${sql.param(1)} AS one, :a AS two`;
const attempt = (args: { a?: number }) => {
	try {
		const { text, values } = sql.as<{ one: number; two: number }>(
			statement,
			args,
		);
		console.log("compiled:", text, values);
	} catch (error) {
		console.log("rejected:", error instanceof Error ? error.message : error);
	}
};
attempt({});
attempt({ a: 2 });
