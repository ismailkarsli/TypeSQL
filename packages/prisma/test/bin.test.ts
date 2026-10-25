import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, expect, inject, test, vi } from "vitest";

// src/bin.ts as Prisma runs it (requests on stdin, responses on stderr), in the test process.
// The requests are the ones `prisma generate` sent for test/fixtures/schema.prisma (test/setup.ts).

const { dir, invocation, requests } = inject("prismaGenerate");

let stdin: PassThrough & { isTTY?: boolean };
let stderr: string;
let stdout: string[];

beforeEach(() => {
	vi.resetModules();
	stdin = new PassThrough();
	stderr = "";
	stdout = [];
	const err = new PassThrough();
	err.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
	vi.spyOn(process, "stdin", "get").mockReturnValue(
		stdin as unknown as typeof process.stdin,
	);
	vi.spyOn(process, "stderr", "get").mockReturnValue(
		err as unknown as typeof process.stderr,
	);
	vi.spyOn(console, "log").mockImplementation((...args) => {
		stdout.push(args.join(" "));
	});
	vi.stubEnv("PRISMA_GENERATOR_INVOCATION", undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

/** Runs src/bin.ts with `lines` on stdin; resolves when it is done (stdin ended). */
async function bin(lines: readonly string[]): Promise<unknown[]> {
	for (const l of lines) stdin.write(l + "\n");
	stdin.end();
	await import("../src/bin.js");
	return stderr
		.trim()
		.split("\n")
		.filter((l) => l !== "")
		.map((l) => JSON.parse(l));
}

test("prisma generate's requests: the manifest, then the schema file", async () => {
	vi.stubEnv("PRISMA_GENERATOR_INVOCATION", invocation);
	const file = join(dir, "typesql.ts");
	await rm(file, { force: true });
	const ids = requests.map((r) => (JSON.parse(r) as { id: number }).id);
	expect(
		requests.map((r) => (JSON.parse(r) as { method: string }).method),
	).toEqual(["getManifest", "generate"]);
	expect(await bin(requests)).toEqual([
		{
			jsonrpc: "2.0",
			id: ids[0],
			result: {
				manifest: { prettyName: "TypeSQL schema", requiresEngines: [] },
			},
		},
		{ jsonrpc: "2.0", id: ids[1], result: null },
	]);
	expect(stdout).toEqual([]);
	expect(await readFile(file, "utf8")).toBe(
		await readFile(new URL("fixtures/typesql.ts", import.meta.url), "utf8"),
	);
});

test("on a terminal, outside prisma generate, it prints how to use it", async () => {
	stdin.isTTY = true;
	expect(await bin([])).toEqual([]);
	expect(stdout).toEqual([
		`typesql-prisma is a Prisma generator. Add it to schema.prisma and run \`prisma generate\`:

  generator typesql {
    provider = "typesql-prisma"
    output   = "../src/db/typesql.ts"
  }`,
	]);
});

const manifest = JSON.stringify({
	jsonrpc: "2.0",
	id: 1,
	method: "getManifest",
	params: { name: "typesql", output: null, config: {} },
});
const manifestResponse = {
	jsonrpc: "2.0",
	id: 1,
	result: { manifest: { prettyName: "TypeSQL schema", requiresEngines: [] } },
};

test("run by prisma from a terminal, it serves the protocol", async () => {
	stdin.isTTY = true;
	vi.stubEnv("PRISMA_GENERATOR_INVOCATION", invocation);
	expect(await bin([manifest])).toEqual([manifestResponse]);
	expect(stdout).toEqual([]);
});

test("with stdin not a terminal, it serves the protocol", async () => {
	expect(await bin([manifest])).toEqual([manifestResponse]);
	expect(stdout).toEqual([]);
});
