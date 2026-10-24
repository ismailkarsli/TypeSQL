import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { emptyCache, type Group, parseCache } from "../../src/cache/format.js";
import {
	type Contribution,
	ddlEntryId,
	groupEntryId,
	merge,
	withLock,
	writeCache,
} from "../../src/cache/store.js";

const M = "__T.Missing";
const group = (keys: string[], words: string[]): Group => ({
	t: "{}",
	h: "never",
	w: Object.fromEntries(words.map((w) => [w, [M, M, M, M] as const])),
	q: {},
	entries: Object.fromEntries(
		keys.map((k) => [k, { r: [...words, "*"], a: "{}" }]),
	),
});
const mine = (
	keys: string[],
	words: string[],
	ddl: string[] = [],
): Contribution => ({
	groups: { g: group(keys, words) },
	maps: {},
	ddl: Object.fromEntries(
		ddl.map((k) => [
			k,
			[{ d: { t: "{}", w: {}, q: {} }, r: ["*"], s: "{}", x: "never" }],
		]),
	),
});

describe("a file shared by several projects", () => {
	test("each project owns what it uses; a pass replaces only its own entries", () => {
		let file = merge(
			emptyCache("v"),
			mine(["A", "B"], ["a", "b"]),
			"app/tsconfig.json",
		);
		file = merge(file, mine(["B", "C"], ["b", "c"]), "test/tsconfig.json");
		expect(Object.keys(file.groups.g!.entries).sort()).toEqual(["A", "B", "C"]);
		expect(file.owners[groupEntryId("g", "B")]).toEqual([
			"app/tsconfig.json",
			"test/tsconfig.json",
		]);
		// the app project no longer uses A: it goes; B stays (the tests still use it)
		file = merge(file, mine(["B"], ["b"]), "app/tsconfig.json");
		expect(Object.keys(file.groups.g!.entries).sort()).toEqual(["B", "C"]);
		expect(file.groups.g!.w.a).toBeUndefined();
		expect(file.groups.g!.w.c).toBeDefined();
		// the tests stop using everything
		file = merge(file, { groups: {}, maps: {}, ddl: {} }, "test/tsconfig.json");
		expect(Object.keys(file.groups.g!.entries)).toEqual(["B"]);
		expect(file.owners[groupEntryId("g", "B")]).toEqual(["app/tsconfig.json"]);
	});

	test("DDL entries are owned the same way", () => {
		let file = merge(emptyCache("v"), mine([], [], ["CREATE TABLE t ()"]), "a");
		expect(file.owners[ddlEntryId("CREATE TABLE t ()")]).toEqual(["a"]);
		file = merge(file, mine([], [], []), "a");
		expect(file.ddl).toEqual({});
	});
});

test("call variants of other projects for the same statement are kept", () => {
	const call = (k: string) => ({
		m: "m1",
		k,
		g: "unknown",
		p: "[]",
		q: '__T.Query<{}, [], "S">',
	});
	const withCall = (k: string): Contribution => ({
		groups: {
			g: {
				...group([], ["s"]),
				entries: { S: { r: ["s", "*"], a: "{}", c: [call(k)] } },
			},
		},
		maps: { m1: "{}" },
		ddl: {},
	});
	let file = merge(emptyCache("v"), withCall('"preserve"'), "app");
	file = merge(file, withCall('"camelCase"'), "tests");
	expect(file.groups.g!.entries.S!.c!.map((c) => c.k).sort()).toEqual([
		'"camelCase"',
		'"preserve"',
	]);
	file = merge(file, withCall('"preserve"'), "app");
	expect(file.groups.g!.entries.S!.c).toHaveLength(2);
});

describe("writing", () => {
	test("writes through a temporary file, and reports an unchanged file", async () => {
		const dir = mkdtempSync(join(tmpdir(), "typesql-cache-"));
		try {
			const path = join(dir, "q.typesqlcache");
			const file = merge(emptyCache("v"), mine(["A"], ["a"]), "p");
			expect(await withLock(path, async () => writeCache(path, file))).toBe(
				true,
			);
			expect(writeCache(path, file)).toBe(false);
			expect(parseCache(readFileSync(path, "utf8"))).toEqual(file);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("a second writer waits for the lock", async () => {
		const dir = mkdtempSync(join(tmpdir(), "typesql-cache-"));
		try {
			const path = join(dir, "q.typesqlcache");
			const order: string[] = [];
			let release!: () => void;
			const first = withLock(
				path,
				() =>
					new Promise<void>((r) => {
						release = r;
						order.push("first");
					}),
			);
			await new Promise((r) => setTimeout(r, 20));
			const second = withLock(path, async () => void order.push("second"));
			await new Promise((r) => setTimeout(r, 250));
			expect(order).toEqual(["first"]);
			release();
			await Promise.all([first, second]);
			expect(order).toEqual(["first", "second"]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
