import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(
	new URL("../packages/core/package.json", import.meta.url),
);
interface PgClient {
	connect(): Promise<void>;
	query<R extends readonly unknown[]>(text: string): Promise<{ rows: R }>;
	end(): Promise<void>;
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
	new URL(
		"../packages/core/src/postgres/engine/typer/catalog.ts",
		import.meta.url,
	),
	"utf8",
);
const start = catalogSrc.indexOf("export interface FunctionCatalog");
const body = catalogSrc.slice(start, catalogSrc.indexOf("\n}\n", start));
const curated = new Set(
	[...body.matchAll(/(?:^|; )\s*([a-z_][a-z0-9_]*): (?:\[\s*Sig<|Sig<)/gm)].map(
		(m) => m[1]!,
	),
);

const client = new Client({ connectionString: url });
await client.connect();
const { rows } = await client.query<
	{ name: string; srf: boolean; kind: string; strict: boolean; ret: string }[]
>(`
  WITH bad AS (
    SELECT oid FROM pg_type
     WHERE typname IN ('internal', 'cstring', 'trigger', 'event_trigger', 'language_handler', 'fdw_handler',
                       'index_am_handler', 'table_am_handler', 'tsm_handler')
  )
  SELECT p.proname AS name, p.proretset AS srf, p.prokind AS kind, p.proisstrict AS strict,
         CASE
           WHEN t.typtype = 'p' AND t.typname NOT IN ('void', 'record') THEN 'unknown'
           WHEN t.typcategory = 'A' AND e.oid IS NOT NULL THEN e.typname || '[]'
           ELSE t.typname
         END AS ret
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_type t ON t.oid = p.prorettype
    LEFT JOIN pg_type e ON e.oid = t.typelem AND t.typcategory = 'A'
   WHERE n.nspname = 'pg_catalog'
     AND p.prorettype NOT IN (SELECT oid FROM bad)
     AND NOT (p.proargtypes::oid[] && ARRAY(SELECT oid FROM bad))
     AND NOT EXISTS (SELECT 1 FROM pg_operator o WHERE o.oprcode = p.oid)
     AND NOT EXISTS (SELECT 1 FROM pg_type ty WHERE p.oid IN (ty.typinput, ty.typoutput, ty.typreceive, ty.typsend, ty.typmodin, ty.typmodout, ty.typanalyze, ty.typsubscript))
     AND NOT EXISTS (SELECT 1 FROM pg_aggregate a WHERE p.oid IN (a.aggtransfn, a.aggfinalfn, a.aggcombinefn, a.aggserialfn, a.aggdeserialfn, a.aggmtransfn, a.aggminvtransfn, a.aggmfinalfn))
     AND NOT EXISTS (SELECT 1 FROM pg_amproc ap WHERE ap.amproc = p.oid)
     AND NOT EXISTS (SELECT 1 FROM pg_conversion cv WHERE cv.conproc = p.oid)
     AND p.proname !~ '^(_|binary_upgrade_)'
   ORDER BY p.proname, p.oid`);
await client.end();

const fns = new Map<
	string,
	{
		rets: Set<string>;
		srf: boolean;
		agg: boolean;
		window: boolean;
		strict: boolean;
	}
>();
for (const r of rows) {
	if (curated.has(r.name)) continue;
	const f = fns.get(r.name) ?? {
		rets: new Set<string>(),
		srf: true,
		agg: true,
		window: true,
		strict: true,
	};
	f.rets.add(r.ret);
	f.srf &&= r.srf;
	f.agg &&= r.kind === "a";
	f.window &&= r.kind === "w";
	f.strict &&= r.strict;
	fns.set(r.name, f);
}

let out = `import type { Sig } from "./catalog.js";

export interface PgFunctions {
`;
for (const [name, f] of fns) {
	const ret = f.rets.size === 1 ? [...f.rets][0] : "unknown";
	const flags = [
		f.srf ? "srf: true" : null,
		f.agg ? "agg: true" : null,
		f.window ? "window: true" : null,
		ret === "unknown" || !f.strict ? "nullable: true" : null,
	].filter(Boolean);
	out += `  ${name}: Sig<["..."], ${JSON.stringify(ret)}${flags.length ? `, { ${flags.join("; ")} }` : ""}>;\n`;
}
out += "}\n";
writeFileSync(
	new URL(
		"../packages/core/src/postgres/engine/typer/pg-functions.ts",
		import.meta.url,
	),
	out,
);
console.log(
	`wrote ${fns.size} functions (${curated.size} curated in FunctionCatalog)`,
);
