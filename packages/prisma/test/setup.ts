import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";

declare module "vitest" {
	export interface ProvidedContext {
		/** What `prisma generate` sends the typesql generator for test/fixtures/schema.prisma. */
		prismaGenerate: {
			/** The schema's directory: the generator's `output` is `<dir>/typesql.ts`. */
			readonly dir: string;
			/** PRISMA_GENERATOR_INVOCATION as Prisma sets it for the generator process. */
			readonly invocation: string;
			/** The JSON-RPC request lines, in order. */
			readonly requests: readonly string[];
		};
	}
}

const pkg = fileURLToPath(new URL("..", import.meta.url));
const prisma = fileURLToPath(
	new URL("../node_modules/.bin/prisma", import.meta.url),
);
const env = { ...process.env, CHECKPOINT_DISABLE: "1" };

/**
 * Generates the Prisma Client fixture (`test/fixtures/client`, gitignored) the type tests import,
 * and records the requests `prisma generate` sends the typesql generator, so test/bin.test.ts
 * can replay them to src/bin.ts in the test process (where coverage is collected).
 */
export default function setup(project: TestProject): () => void {
	execFileSync(
		prisma,
		[
			"generate",
			"--schema",
			"test/fixtures/schema.prisma",
			"--generator",
			"client",
			"--no-hints",
		],
		{ cwd: pkg, env, stdio: "ignore" },
	);

	const dir = mkdtempSync(join(tmpdir(), "typesql-prisma-record-"));
	const schema = readFileSync(join(pkg, "test/fixtures/schema.prisma"), "utf8");
	const typesqlProvider =
		'provider = "node --import ./test/fixtures/ts-resolve.ts ./src/bin.ts"';
	if (!schema.includes(typesqlProvider))
		throw new Error(`test/fixtures/schema.prisma: no ${typesqlProvider}`);
	writeFileSync(
		join(dir, "schema.prisma"),
		schema.replace(
			typesqlProvider,
			'provider = "node ./test/fixtures/record-generator.ts"',
		),
	);
	const record = join(dir, "requests.jsonl");
	execFileSync(
		prisma,
		[
			"generate",
			"--schema",
			join(dir, "schema.prisma"),
			"--generator",
			"typesql",
			"--no-hints",
		],
		{
			cwd: pkg,
			env: { ...env, TYPESQL_PRISMA_RECORD: record },
			stdio: "ignore",
		},
	);
	const [first, ...requests] = readFileSync(record, "utf8")
		.trimEnd()
		.split("\n");
	const { invocation } = JSON.parse(first!) as { invocation: string };
	project.provide("prismaGenerate", { dir, invocation, requests });
	return () => rmSync(dir, { recursive: true, force: true });
}
