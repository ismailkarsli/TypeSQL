import { createSql, type Executor } from "@typesql/core";
import { postgresDialect } from "@typesql/core/postgres";

const message = async (rows: AsyncIterable<unknown>) => {
	try {
		for await (const _ of rows);
		return "resolved";
	} catch (error) {
		return error instanceof Error ? error.message : error;
	}
};

// An executor without stream() runs queries but cannot stream them.
const rowsOnly: Executor = async () => [{ n: 1 }];
const sql = createSql<{}>(postgresDialect, rowsOnly);
export const rows = await sql("SELECT 1 AS n").exec();
const withoutStream = await message(sql("SELECT 1 AS n").stream());
const withoutExecutor = await message(
	createSql<{}>(postgresDialect)("SELECT 1 AS n").stream(),
);
// An executor's stream() yields batches; the query yields their rows.
const batches: Executor = Object.assign(async () => [], {
	stream: async function* () {
		yield [{ n: 1 }, { n: 2 }];
		yield [{ n: 3 }];
	},
});
async function collect<T>(rows: AsyncIterable<T>): Promise<T[]> {
	const all: T[] = [];
	for await (const row of rows) all.push(row);
	return all;
}
export const streamed = await collect(
	createSql<{}>(postgresDialect, batches)("SELECT 1 AS n").stream(),
);

console.dir(
	{ rows, withoutStream, withoutExecutor, streamed },
	{ depth: null },
);
