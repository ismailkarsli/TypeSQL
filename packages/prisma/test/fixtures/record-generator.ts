// A stand-in Prisma generator for test/setup.ts: appends every JSON-RPC request line Prisma
// sends to the file named by TYPESQL_PRISMA_RECORD (with the PRISMA_GENERATOR_INVOCATION value
// Prisma set), and answers like typesql-prisma, so the tests can replay the exact requests to
// src/bin.ts in-process.
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const file = process.env["TYPESQL_PRISMA_RECORD"]!;
appendFileSync(
	file,
	JSON.stringify({ invocation: process.env["PRISMA_GENERATOR_INVOCATION"] }) +
		"\n",
);
createInterface({ input: process.stdin, crlfDelay: Infinity }).on(
	"line",
	(line) => {
		appendFileSync(file, line + "\n");
		const req = JSON.parse(line) as { id: number; method: string };
		const result =
			req.method === "getManifest"
				? { manifest: { prettyName: "TypeSQL schema", requiresEngines: [] } }
				: null;
		process.stderr.write(
			JSON.stringify({ jsonrpc: "2.0", id: req.id, result }) + "\n",
		);
	},
);
