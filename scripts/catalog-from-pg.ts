import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(
	new URL("../packages/core/package.json", import.meta.url),
);
interface PgClient {
	connect(): Promise<void>;
	query<R extends readonly unknown[]>(
		text: string,
		values?: unknown[],
	): Promise<{ rows: R }>;
	end(): Promise<void>;
}
interface ProcRow {
	name: string;
	args: string;
	ret: string;
	strict: boolean;
	srf: boolean;
	kind: string;
	variadic: boolean;
}
const { Client } = require("pg") as {
	Client: new (config: { connectionString: string }) => PgClient;
};

const url = process.env.TYPESQL_PG_URL;
if (!url) {
	console.error(
		"set TYPESQL_PG_URL (e.g. docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=x postgres:18)",
	);
	process.exit(2);
}

const catalogSrc = readFileSync(
	new URL("../packages/core/src/engine/typer/catalog.ts", import.meta.url),
	"utf8",
);
const body = catalogSrc.slice(
	catalogSrc.indexOf("export interface FunctionCatalog"),
	catalogSrc.indexOf(
		"\n}\n",
		catalogSrc.indexOf("export interface FunctionCatalog"),
	),
);
const catalogNames = [
	...new Set(
		[
			...body.matchAll(/(?:^|; )\s*([a-z_][a-z0-9_]*): (?:\[\s*Sig<|Sig<)/gm),
		].map((m) => m[1]!),
	),
];
const names = process.argv.slice(2).length
	? process.argv.slice(2)
	: catalogNames;

const client = new Client({ connectionString: url });
await client.connect();
const { rows } = await client.query<ProcRow[]>(
	`SELECT p.proname AS name,
          coalesce(array_to_string(array(SELECT format_type(t, NULL) FROM unnest(p.proargtypes) AS t), ', '), '') AS args,
          format_type(p.prorettype, NULL) AS ret,
          p.proisstrict AS strict, p.proretset AS srf, p.prokind AS kind, p.provariadic <> 0 AS variadic
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'pg_catalog' AND p.proname = ANY($1)
    ORDER BY p.proname, p.pronargs, args`,
	[names],
);
await client.end();

const found = new Set(rows.map((r) => r.name));
let current = "";
for (const r of rows) {
	if (r.name !== current) {
		current = r.name;
		console.log(
			`\n${r.name}${catalogNames.includes(r.name) ? "" : "   (not in FunctionCatalog)"}`,
		);
	}
	const flags = [
		r.kind === "a" ? "agg" : r.kind === "w" ? "window" : null,
		r.srf ? "srf" : null,
		r.strict ? null : "non-strict",
		r.variadic ? "variadic" : null,
	]
		.filter(Boolean)
		.join(", ");
	console.log(`  (${r.args}) → ${r.ret}${flags ? `   [${flags}]` : ""}`);
}
const missing = names.filter((n) => !found.has(n));
if (missing.length)
	console.log(
		`\nnot in pg_catalog (extension or special syntax): ${missing.join(", ")}`,
	);
