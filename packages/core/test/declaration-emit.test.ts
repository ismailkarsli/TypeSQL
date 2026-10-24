import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const tsc = resolve(here, "../../../node_modules/.bin/tsc");

/**
 * Rows returned by `execute*` must be plain object types in declaration output. A named TypeSQL
 * type in them would make every package that re-exports such a function depend on
 * `@typesql/core` directly; TypeScript 7.1 reports TS2883 otherwise.
 */
test("rows are plain object types in declaration output", () => {
	const out = mkdtempSync(join(tmpdir(), "typesql-emit-"));
	try {
		execFileSync(
			tsc,
			[
				"--ignoreConfig",
				resolve(here, "emit/fixtures/rows.ts"),
				"--declaration",
				"--emitDeclarationOnly",
				"--outDir",
				out,
				"--rootDir",
				resolve(here, ".."),
				"--strict",
				"--target",
				"es2024",
				"--module",
				"esnext",
				"--moduleResolution",
				"bundler",
				"--skipLibCheck",
				"--types",
				"",
			],
			{ encoding: "utf8", stdio: "pipe" },
		);
		const dts = readFileSync(join(out, "test/emit/fixtures/rows.d.ts"), "utf8");
		expect(dts).not.toContain("import(");
		expect(dts).toContain('mood: "happy" | "sad";');
		expect(dts).toContain("session_length: {");
	} finally {
		rmSync(out, { recursive: true, force: true });
	}
}, 60_000);
