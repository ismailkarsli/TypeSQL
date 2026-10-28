import { describe, expect, test, vi } from "vitest";
import {
	type Col,
	createSql,
	type Executor,
	type Generated,
	NoResultError,
	type Nullable,
} from "../../src/index.js";

interface DB {
	users: {
		id: Generated<"int4">;
		email: Col<"text">;
		display_name: Nullable<"text">;
	};
}

describe("sql.prepare", () => {
	test("defers execution and produces independent queries for each binding", async () => {
		const run = vi
			.fn<Executor>()
			.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 3 });
		const sql = createSql<DB>(run);
		const find = sql.prepare("SELECT id FROM users WHERE id = $1");
		expect(run).not.toHaveBeenCalled();
		const first = find(1);
		const second = find(2);
		expect(first).toStrictEqual({
			text: "SELECT id FROM users WHERE id = $1",
			values: [1],
		});
		expect(second.values).toEqual([2]);
		expect(first.values).not.toBe(second.values);
		expect(await first.execute()).toEqual([{ id: 1 }]);
		expect(await first.executeTakeFirst()).toEqual({ id: 1 });
		expect(await first.executeTakeFirstOrThrow()).toEqual({ id: 1 });
		expect(await second.executeCount()).toBe(3);
		expect(run).toHaveBeenLastCalledWith(second.text, [2]);
	});

	test("rewrites repeated named parameters and binds a fresh object each time", () => {
		const sql = createSql<DB>();
		const find = sql.prepare(
			"SELECT id FROM users WHERE id = :id OR id = :id OR email = :email",
		);
		expect(find({ email: "a", id: 1 })).toStrictEqual({
			text: "SELECT id FROM users WHERE id = $1 OR id = $1 OR email = $2",
			values: [1, "a"],
		});
		expect(find({ id: 2, email: "b" }).values).toEqual([2, "b"]);
	});

	test("captures inline and fragment values once and renumbers them after bound parameters", () => {
		const sql = createSql<DB>();
		const where = sql.fragment("AND email = $1", "fixed");
		const find = sql.prepare(
			`SELECT id FROM users WHERE id > $1 AND id < ${sql.param(100)} {where}`,
			{ where },
		);
		expect(find(1)).toStrictEqual({
			text: "SELECT id FROM users WHERE id > $1 AND id < $2 AND email = $3",
			values: [1, 100, "fixed"],
		});
		expect(find(2).values).toEqual([2, 100, "fixed"]);
		// Compiling snapshots the fragment's text and its values array.
		(where.values as unknown[])[0] = "changed";
		expect(find(3).values).toEqual([3, 100, "fixed"]);
		const named = sql.prepare("SELECT id FROM users WHERE id = :id {where}", {
			where,
		});
		expect(named({ id: 4 }).values).toEqual([4, "changed"]);
	});

	test("handles no parameters, inline-only values and inline DEFAULT", () => {
		const sql = createSql<DB>();
		expect(sql.prepare("SELECT id FROM users")()).toStrictEqual({
			text: "SELECT id FROM users",
			values: [],
		});
		const inline = sql.prepare(
			`SELECT id FROM users WHERE id = ${sql.param(7)}`,
		);
		expect(inline().values).toEqual([7]);
		expect(inline().values).toEqual([7]);
		const insert = sql.prepare(
			`INSERT INTO users (id, email) VALUES (${sql.param(undefined)}, $1)`,
		);
		expect(insert("a")).toStrictEqual({
			text: "INSERT INTO users (id, email) VALUES (DEFAULT, $1)",
			values: ["a"],
		});
		expect(insert("b").values).toEqual(["b"]);
	});

	test("ignores placeholder-like text in literals, comments and quoted strings", () => {
		const sql = createSql<DB>();
		const bind = sql.prepare(
			"SELECT ':name $99' AS s, $$:other $88$$ AS d /* $77 */ WHERE $1::int4 > 0",
		);
		expect(bind(1).values).toEqual([1]);
		expect(sql.prepare("SELECT id FROM users", {})().values).toEqual([]);
	});

	test("unwraps JSON values on each binding", () => {
		const sql = createSql<DB>();
		const bind = sql.prepare("SELECT $1::jsonb AS data");
		const first = bind(sql.json([1, 2]));
		const second = bind(sql.json([3]));
		expect(first.values[0]).toMatchObject({ value: [1, 2] });
		expect(second.values[0]).toMatchObject({ value: [3] });
	});

	test("rejects missing or extra bindings before they shift fixed parameters", () => {
		const sql = createSql<DB>();
		const bind = sql.prepare(
			`SELECT id FROM users WHERE id = $1 AND email = ${sql.param("fixed")}`,
		) as (...args: unknown[]) => unknown;
		expect(() => bind()).toThrow("expects 1 parameters, got 0");
		expect(() => bind(1, 2)).toThrow("expects 1 parameters, got 2");
		const named = sql.prepare("SELECT id FROM users WHERE id = :id") as (
			...args: unknown[]
		) => unknown;
		for (const args of [[], [null], [1], [{ id: 1 }, {}]]) {
			expect(() => named(...args)).toThrow("takes exactly one object argument");
		}
		expect(() => named({})).toThrow("missing named parameter :id");
	});

	test("prepares the final text once and uses that executor for every execution method", async () => {
		const prepared = Object.assign(
			vi.fn<Executor>().mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 }),
			{ count: vi.fn().mockResolvedValue(4) },
		);
		const run = Object.assign(vi.fn<Executor>(), {
			prepare: vi.fn().mockReturnValue(prepared),
		});
		const sql = createSql<DB>(run);
		const bind = sql.prepare("SELECT id FROM users WHERE id = :id");
		expect(run.prepare).toHaveBeenCalledExactlyOnceWith(
			"SELECT id FROM users WHERE id = $1",
		);
		expect(prepared).not.toHaveBeenCalled();
		await bind({ id: 1 }).execute();
		await bind({ id: 2 }).executeTakeFirst();
		expect(await bind({ id: 3 }).executeCount()).toBe(4);
		expect(prepared.count).toHaveBeenCalledWith(
			"SELECT id FROM users WHERE id = $1",
			[3],
		);
		expect(run.prepare).toHaveBeenCalledTimes(1);
		expect(run).not.toHaveBeenCalled();
		const override = vi.fn<Executor>().mockResolvedValue([]);
		expect(await bind({ id: 4 }).execute(override)).toEqual([]);
		expect(override).toHaveBeenCalledWith(
			"SELECT id FROM users WHERE id = $1",
			[4],
		);
	});

	test("supports unbound queries, missing rows and camelCase mapping", async () => {
		const bind = createSql<DB>().prepare("SELECT id FROM users WHERE id = $1");
		await expect(bind(1).execute()).rejects.toThrow("no executor");
		await expect(
			bind(1).executeTakeFirstOrThrow(async () => []),
		).rejects.toBeInstanceOf(NoResultError);
		const sql = createSql<DB>(async () => [{ display_name: "A" }], {
			rowKeys: "camelCase",
		});
		expect(
			await sql.prepare("SELECT display_name FROM users")().execute(),
		).toEqual([{ displayName: "A" }]);
	});
});
