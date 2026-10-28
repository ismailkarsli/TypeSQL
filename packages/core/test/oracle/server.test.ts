import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { type Database, startDockerPostgres } from "../conformance/db.js";
import {
	REGRESS_MOUNT,
	regressDir,
	regressionFixture,
	verifyRegressionData,
} from "./server.js";

const temporary: string[] = [];
afterEach(() => {
	for (const path of temporary.splice(0))
		rmSync(path, { recursive: true, force: true });
});

function directory(): string {
	const path = mkdtempSync(join(tmpdir(), "typesql-regress-fixture-test-"));
	temporary.push(path);
	return path;
}

function git(root: string, ...args: string[]): string {
	return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

function sparseFixture(withData: boolean): { root: string; regress: string } {
	const root = directory();
	const regress = join(root, "src/test/regress");
	mkdirSync(join(regress, "sql"), { recursive: true });
	mkdirSync(join(regress, "expected"), { recursive: true });
	writeFileSync(
		join(regress, "sql/test_setup.sql"),
		"COPY items FROM '/regress/data/tenk.data';\n",
	);
	writeFileSync(join(regress, "expected/test_setup.out"), "COPY 1\n");
	if (withData) {
		mkdirSync(join(regress, "data"));
		writeFileSync(join(regress, "data/tenk.data"), "1\tseeded\n");
	}
	git(root, "init", "--quiet");
	git(root, "add", ".");
	git(
		root,
		"-c",
		"user.name=TypeSQL Test",
		"-c",
		"user.email=test@example.invalid",
		"-c",
		"commit.gpgsign=false",
		"-c",
		"core.hooksPath=/dev/null",
		"commit",
		"--quiet",
		"-m",
		"fixture",
	);
	git(
		root,
		"sparse-checkout",
		"set",
		"src/test/regress/sql",
		"src/test/regress/expected",
	);
	return { root, regress };
}

test("a complete fixture is mounted directly and is never removed", () => {
	const regress = directory();
	mkdirSync(join(regress, "sql"));
	mkdirSync(join(regress, "data"));
	const fixture = regressionFixture(regress)!;
	expect(fixture.directory).toBe(regress);
	fixture.close();
	expect(existsSync(regress)).toBe(true);
});

test("sparse checkouts stage the committed data without changing the vendor checkout", () => {
	const { root, regress } = sparseFixture(true);
	expect(existsSync(join(regress, "data"))).toBe(false);
	expect(git(root, "status", "--porcelain")).toBe("");
	const fixture = regressionFixture(regress)!;
	try {
		expect(fixture.directory).not.toBe(regress);
		expect(statSync(fixture.directory).mode & 0o005).toBe(0o005);
		expect(
			readFileSync(join(fixture.directory, "data/tenk.data"), "utf8"),
		).toBe("1\tseeded\n");
		expect(
			readFileSync(join(fixture.directory, "sql/test_setup.sql"), "utf8"),
		).toBe(readFileSync(join(regress, "sql/test_setup.sql"), "utf8"));
		expect(existsSync(join(regress, "data"))).toBe(false);
		expect(git(root, "status", "--porcelain")).toBe("");
	} finally {
		fixture.close();
	}
	expect(existsSync(fixture.directory)).toBe(false);
});

test("a repository without tracked data fails instead of running an empty regression database", () => {
	const { root, regress } = sparseFixture(false);
	expect(() => regressionFixture(regress)).toThrow(
		"the tracked regression fixture has no data directory",
	);
	expect(git(root, "status", "--porcelain")).toBe("");
});

test("a missing regression checkout leaves Docker unmounted", () => {
	expect(regressionFixture(directory())).toBeNull();
});

test("the database user can COPY all 10000 tracked seed rows from the staged mount", async (ctx) => {
	const fixture = regressionFixture(regressDir);
	if (!fixture)
		return ctx.skip("the PostgreSQL regression checkout is unavailable");
	let database: Database;
	try {
		database = await startDockerPostgres(
			process.env["TYPESQL_PG_IMAGE"] ?? "postgres:18",
			["-v", `${fixture.directory}:${REGRESS_MOUNT}:ro`],
		);
	} catch (error) {
		fixture.close();
		if (process.env["TYPESQL_REQUIRE_DB"] === "1") throw error;
		return ctx.skip(`Docker Postgres unavailable: ${(error as Error).message}`);
	}
	try {
		await verifyRegressionData(database.url);
	} finally {
		await database.close();
		fixture.close();
	}
}, 60_000);
