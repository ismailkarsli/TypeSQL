import { join } from "node:path";
import type { Analysis } from "../../src/cache/evaluate.js";
import type { Disagreement, SkipReason } from "./kinds.js";
import type { Connection } from "./replay.js";

type NotNull = (relid: string) => Promise<boolean[]>;
type ViewNullabilityClass = new (
	query: (
		text: string,
		values?: unknown[],
	) => Promise<{ rows: readonly unknown[] }>,
) => { notNull: NotNull };
const nullabilityPath = join(
	import.meta.dirname,
	"../../../pg/src/introspect/nullability.ts",
);
let loaded: Promise<ViewNullabilityClass> | undefined;
const viewNullability = (): Promise<ViewNullabilityClass> =>
	(loaded ??= import(/* @vite-ignore */ nullabilityPath).then(
		(m: { ViewNullability: ViewNullabilityClass }) => m.ViewNullability,
	));

export type ViewVerdict =
	| {
			readonly disagreements: readonly Disagreement[];
			readonly narrowed: number;
	  }
	| { readonly skip: SkipReason };

const VIEW = "typesql_oracle_view";

async function inBlock(conn: Connection): Promise<boolean | null> {
	try {
		const [r] = await conn.sql.unsafe<{ b: boolean }[]>(
			"SELECT xact_start <> query_start AS b FROM pg_stat_activity WHERE pid = pg_backend_pid()",
		);
		return r!.b;
	} catch {
		return null; // an aborted transaction block: nothing runs
	}
}

export function viewableText(text: string): boolean {
	if (/^\s*(\(\s*)*(insert|update|delete|merge)\b/i.test(text)) return false;
	// a data-modifying CTE or a locking clause cannot be in a view
	if (
		/\b(insert\s+into|update\s+\S+\s+set|delete\s+from|merge\s+into)\b|\bfor\s+(no\s+key\s+)?(update|share|key\s+share)\b/i.test(
			text,
		)
	)
		return false;
	return /^\s*(\(\s*)*(select|values|table|with)\b/i.test(text);
}

export function viewable(text: string, ours: Analysis): boolean {
	return (
		ours.max === 0 &&
		ours.kind === "select" &&
		ours.cols.length > 0 &&
		viewableText(text)
	);
}

/** A WHERE or ON condition our narrowing may use: the view analysis does not narrow. */
export function mayNarrow(text: string): boolean {
	const bare = text
		.replace(/'(?:[^']|'')*'/g, "''")
		.replace(/"(?:[^"]|"")*"/g, '""')
		.replace(/--[^\n]*/g, "")
		.replace(/\/\*[\s\S]*?\*\//g, "");
	return /\b(where|on)\b/i.test(bare);
}

export async function viewNotNull(
	conn: Connection,
	text: string,
): Promise<boolean[] | null> {
	const block = await inBlock(conn);
	if (block === null) return null;
	const open = block ? `SAVEPOINT ${VIEW}` : "BEGIN";
	const close = block
		? `ROLLBACK TO SAVEPOINT ${VIEW}; RELEASE SAVEPOINT ${VIEW}`
		: "ROLLBACK";
	if (await conn.tryExec(open)) return null;
	try {
		if (await conn.tryExec(`CREATE TEMP VIEW ${VIEW} AS ${text}`)) return null;
		const [r] = await conn.sql.unsafe<{ oid: string }[]>(
			`SELECT 'pg_temp.${VIEW}'::regclass::oid::text AS oid`,
		);
		const Analyzer = await viewNullability();
		const analyzer = new Analyzer(async (q, values) => ({
			rows: await conn.sql.unsafe(q, (values ?? []) as never[]),
		}));
		return await analyzer.notNull(r!.oid);
	} catch {
		return null;
	} finally {
		await conn.tryExec(close);
	}
}

export function compareView(
	text: string,
	ours: Analysis,
	notNull: readonly boolean[] | null,
): ViewVerdict {
	if (!notNull || notNull.length !== ours.cols.length)
		return { skip: "view-refused" };
	const out: Disagreement[] = [];
	let narrowed = 0;
	ours.cols.forEach((c, i) => {
		const name = JSON.stringify(c.name);
		if (notNull[i] && c.nullable)
			out.push({
				kind: "imprecise",
				detail: `column ${i + 1} ${name}: nullable in ours, the view analysis proves NOT NULL`,
			});
		if (!notNull[i] && !c.nullable) {
			if (mayNarrow(text)) narrowed++;
			else
				out.push({
					kind: "unsound-candidate",
					detail: `column ${i + 1} ${name}: non-null in ours, nullable in the view analysis`,
				});
		}
	});
	return { disagreements: out, narrowed };
}

export async function viewCheck(
	conn: Connection,
	text: string,
	ours: Analysis,
): Promise<ViewVerdict> {
	return compareView(text, ours, await viewNotNull(conn, text));
}
