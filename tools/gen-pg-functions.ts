// Writes PgFunctions, the pg_catalog functions FunctionCatalog does not type, from a
// PostgreSQL server. usage: node tools/gen-pg-functions.ts [--check]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	isInterfaceDeclaration,
	isPropertySignatureDeclaration,
} from "typescript/ast";
import { API } from "typescript/sync";
import { emit, withPostgres } from "./generated.ts";

const catalog = new URL(
	"../packages/core/src/postgres/engine/typer/catalog.ts",
	import.meta.url,
);
const OUTPUT = new URL(
	"../packages/core/src/postgres/engine/typer/pg-functions.ts",
	import.meta.url,
);

/** The functions FunctionCatalog types by hand. */
function curatedFunctions(): Set<string> {
	const api = new API();
	const lease = api.createSourceFile(
		fileURLToPath(catalog),
		readFileSync(catalog, "utf8"),
	);
	try {
		const declaration = lease.sourceFile.statements.find(
			(s) => isInterfaceDeclaration(s) && s.name.text === "FunctionCatalog",
		);
		if (!declaration || !isInterfaceDeclaration(declaration))
			throw new Error("catalog.ts declares no FunctionCatalog interface");
		return new Set(
			declaration.members.flatMap((member) =>
				isPropertySignatureDeclaration(member) ? [member.name.getText()] : [],
			),
		);
	} finally {
		lease.dispose();
		api.close();
	}
}

const curated = curatedFunctions();
const rows = await withPostgres(async (client) => {
	const result = await client.query<{
		name: string;
		srf: boolean;
		kind: string;
		strict: boolean;
		ret: string;
	}>(`
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
	return result.rows;
});

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

let out = `import type { Sig } from "../../schema/functions.js";

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
emit(
	OUTPUT,
	out,
	`${fns.size} functions, ${curated.size} curated in FunctionCatalog`,
);
