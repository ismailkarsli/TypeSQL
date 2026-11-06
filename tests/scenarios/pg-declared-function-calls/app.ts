import { createSql, type RowType } from "@typesql/core";
import { type Col, postgres, type Sig } from "@typesql/core/postgres";

type T = "text";
interface DB {
	t: { label: Col<"text">; maybe: Col<"text", { nullable: true }> };
	$functions: {
		// NULL only when its ninth argument is.
		pick9: Sig<[T, T, T, T, T, T, T, T, T], "text", { strict: [9] }>;
	};
}
const sql = createSql<DB>(postgres);

const picked = sql(`
	SELECT pick9(label, label, label, label, label, label, label, label, maybe) AS ninth_nullable,
		pick9(maybe, maybe, maybe, maybe, maybe, maybe, maybe, maybe, label) AS ninth_set,
		pick9(label, label, label, label, label, label, label, label, label) AS all_set
	FROM t`);
export type Picked = RowType<typeof picked>;

// An unknown function's message names the closest known one.
sql("SELECT crc33(label) FROM t");
