import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const tsc = resolve(here, "../../../node_modules/.bin/tsrs");

/** Rows typed with `PgTypeMap` are plain object types in declaration output (see emit/rows.ts). */
test("PgTypeMap rows are plain object types in declaration output", () => {
	const out = mkdtempSync(join(tmpdir(), "typesql-pg-emit-"));
	try {
		execFileSync(
			tsc,
			["-p", resolve(here, "emit/tsconfig.json"), "--outDir", out],
			{ encoding: "utf8", stdio: "pipe" },
		);
		const dts = readFileSync(join(out, "pg/test/emit/rows.d.ts"), "utf8");
		expect(dts).not.toContain("import(");
		expect(dts).not.toContain("PgInterval");
		expect(dts).toContain("toPostgres(): string;");
	} finally {
		rmSync(out, { recursive: true, force: true });
	}
}, 120_000);
