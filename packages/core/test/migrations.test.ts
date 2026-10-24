import { describe, expect, test } from "vitest";
import {
	type MigrationClient,
	migrations,
	runMigrations,
} from "../src/index.js";

/** Records every query; fails on texts matching `failOn`. */
function fakeClient(
	failOn: RegExp | null = null,
	failRollback = false,
): MigrationClient & { log: string[] } {
	const log: string[] = [];
	return {
		log,
		async query(text: string) {
			log.push(text);
			if (failRollback && text === "ROLLBACK")
				throw new Error("connection lost");
			if (failOn && failOn.test(text)) throw new Error(`failed: ${text}`);
			return { rowCount: 0 };
		},
	};
}

const m = migrations()
	.add("CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL)")
	.add("ALTER TABLE users ADD COLUMN display_name text")
	.add("CREATE INDEX users_email_idx ON users (email)");

describe("migrations()", () => {
	test("collects statements in order", () => {
		expect(m.statements).toEqual([
			"CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL)",
			"ALTER TABLE users ADD COLUMN display_name text",
			"CREATE INDEX users_email_idx ON users (email)",
		]);
		expect(migrations().statements).toEqual([]);
	});

	test("is immutable: add() returns a new builder", () => {
		const base = migrations().add("CREATE TABLE a (x int)");
		const b1 = base.add("CREATE TABLE b (y int)");
		const b2 = base.add("CREATE TABLE c (z int)");
		expect(base.statements).toEqual(["CREATE TABLE a (x int)"]);
		expect(b1.statements).toEqual([
			"CREATE TABLE a (x int)",
			"CREATE TABLE b (y int)",
		]);
		expect(b2.statements).toEqual([
			"CREATE TABLE a (x int)",
			"CREATE TABLE c (z int)",
		]);
		expect(Object.isFrozen(base)).toBe(true);
		expect(Object.isFrozen(base.statements)).toBe(true);
		expect(() => (base.statements as string[]).push("DROP TABLE a")).toThrow(
			TypeError,
		);
	});

	test("schema is phantom; raw() appends unchecked text", () => {
		expect(m.schema).toBeUndefined();
		expect(m.raw("SELECT 1").statements.at(-1)).toBe("SELECT 1");
	});
});

describe("runMigrations()", () => {
	test("runs every statement in order inside BEGIN / COMMIT", async () => {
		const client = fakeClient();
		await runMigrations(client, m);
		expect(client.log).toEqual(["BEGIN", ...m.statements, "COMMIT"]);
	});

	test("an empty list still opens and commits a transaction", async () => {
		const client = fakeClient();
		await runMigrations(client, migrations());
		expect(client.log).toEqual(["BEGIN", "COMMIT"]);
	});

	test("rolls back and rethrows on the first failure; later statements do not run", async () => {
		const client = fakeClient(/^ALTER/);
		await expect(runMigrations(client, m)).rejects.toThrow(
			"failed: ALTER TABLE users ADD COLUMN display_name text",
		);
		expect(client.log).toEqual([
			"BEGIN",
			m.statements[0],
			m.statements[1],
			"ROLLBACK",
		]);
	});

	test("a failing COMMIT is rolled back and reported", async () => {
		const client = fakeClient(/^COMMIT$/);
		await expect(runMigrations(client, m)).rejects.toThrow("failed: COMMIT");
		expect(client.log.slice(-2)).toEqual(["COMMIT", "ROLLBACK"]);
	});

	test("the original error wins over a failing ROLLBACK", async () => {
		const client = fakeClient(/^CREATE INDEX/, true);
		const err = await runMigrations(client, m).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe(
			"failed: CREATE INDEX users_email_idx ON users (email)",
		);
		expect(client.log.at(-1)).toBe("ROLLBACK");
	});

	test("a failing BEGIN is propagated without running statements", async () => {
		const client = fakeClient(/^BEGIN$/);
		await expect(runMigrations(client, m)).rejects.toThrow("failed: BEGIN");
		expect(client.log).toEqual(["BEGIN"]);
	});
});
