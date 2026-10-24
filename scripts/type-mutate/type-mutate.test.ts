import { execFileSync, spawnSync } from "node:child_process";
import {
	cpSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SyntaxKind } from "typescript/ast";
import { API } from "typescript/async";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { findMutants } from "./sites.ts";
import {
	assignIds,
	equivalence,
	equivalenceMarkers,
	fallbackOrder,
	inShard,
	type KillMap,
	lineStarts,
	type MutantResult,
	markdownSummary,
	mergeReports,
	parseDiff,
	parseShard,
	parseSites,
	position,
	type Report,
	readKillMap,
	type Status,
	summarize,
	TestOrder,
	updateKillMap,
} from "./support.ts";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "..", "type-mutate.ts");
const fixture = join(here, "fixture");

// what a run writes for each mutant, as far as the tests look
type RunMutant = MutantResult & { checks: number; tried?: string[] };

describe("mutation sites", () => {
	let api: API | undefined;
	beforeAll(() => {
		api = new API({ cwd: here });
	});
	afterAll(() => api?.close());

	const mutants = async (text: string) => {
		const retained = await api!.createSourceFile("/x.ts", text);
		try {
			return findMutants(retained.sourceFile, SyntaxKind).map((m) => ({
				mutator: m.mutator,
				scope: m.scope,
				mutated: text.slice(0, m.start) + m.text + text.slice(m.end),
			}));
		} finally {
			await retained.dispose();
		}
	};

	test("conditional types: swap, one branch for both, a branch as never", async () => {
		const ms = await mutants("type A<T> = T extends string ? 1 : 2;");
		expect(ms.map((m) => [m.mutator, m.mutated])).toEqual([
			["cond-swap", "type A<T> = T extends string ? 2 : 1;"],
			["cond-true", "type A<T> = T extends string ? 1 : 1;"],
			["cond-false", "type A<T> = T extends string ? 2 : 2;"],
			["never-true", "type A<T> = T extends string ? never : 2;"],
			["never-false", "type A<T> = T extends string ? 1 : never;"],
		]);
		expect(new Set(ms.map((m) => m.scope))).toEqual(new Set(["A"]));
	});

	test("a branch that uses an infer name is not moved out of its scope", async () => {
		const ms = await mutants("type A<T> = T extends [infer X] ? X : 0;");
		expect(ms.map((m) => m.mutator)).toEqual([
			"cond-false",
			"never-true",
			"never-false",
		]);
		expect(ms[0]!.mutated).toBe("type A<T> = T extends [infer X] ? 0 : 0;");
	});

	test("the false branch of `X extends infer S` / `unknown` / `any` cannot be reached and is not mutated", async () => {
		const ms = await mutants("type A<T> = F<T> extends infer X ? [X] : 0;");
		expect(ms.map((m) => m.mutator)).toEqual(["cond-false", "never-true"]);
		expect(
			(await mutants("type A<T> = T extends unknown ? [T] : 0;")).map(
				(m) => m.mutator,
			),
		).toEqual(["cond-swap", "cond-false", "never-true"]);
		expect(
			(await mutants("type A<T> = T extends any ? [T] : 0;")).map(
				(m) => m.mutator,
			),
		).toEqual(["cond-swap", "cond-false", "never-true"]);
		// a constraint can fail
		const constrained = await mutants(
			"type A<T> = F<T> extends infer X extends string ? [X] : 0;",
		);
		expect(constrained.map((m) => m.mutator)).toEqual([
			"cond-false",
			"never-true",
			"infer-bare",
			"never-false",
		]);
	});

	test("a declaration marked as a table is not mutated", async () => {
		const text =
			"type A = [true, false];\n// type-mutate: table – checked by the oracles\ninterface T { f: [1, 2]; g: true }\ntype B = true;";
		expect((await mutants(text)).map((m) => m.scope)).toEqual([
			"A",
			"A",
			"A",
			"B",
		]);
		// a reason is required
		expect(
			(await mutants("// type-mutate: table\ntype C = true;")).map(
				(m) => m.mutator,
			),
		).toEqual(["bool-flip"]);
	});

	test("true/false literal types flip; an edit two mutators make is tried once", async () => {
		const ms = await mutants("type A = [true, false];");
		expect(ms.map((m) => [m.mutator, m.mutated])).toEqual([
			["bool-flip", "type A = [false, false];"],
			["tuple-swap", "type A = [false, true];"],
			["bool-flip", "type A = [true, true];"],
		]);
		const c = await mutants("type B<T> = T extends 1 ? true : false;");
		expect(
			c.filter((m) => m.mutated === "type B<T> = T extends 1 ? false : false;"),
		).toHaveLength(1);
	});

	test("unions of string literals lose one member at a time", async () => {
		const ms = await mutants(
			'type A = "a" | "b" | "c";\ntype B =\n  | "x"\n  | "y";\ntype C = "a" | number;',
		);
		expect(
			ms
				.filter((m) => m.mutator === "union-drop")
				.map((m) => m.mutated.split("\n").slice(0, 4).join("\n")),
		).toEqual([
			'type A = "b" | "c";\ntype B =\n  | "x"\n  | "y";',
			'type A = "a" | "c";\ntype B =\n  | "x"\n  | "y";',
			'type A = "a" | "b";\ntype B =\n  | "x"\n  | "y";',
			'type A = "a" | "b" | "c";\ntype B =\n  "y";\ntype C = "a" | number;',
			'type A = "a" | "b" | "c";\ntype B =\n  | "x";\ntype C = "a" | number;',
		]);
	});

	test("tuple members of the same kind swap; named members and rest elements do not", async () => {
		const ms = await mutants("type A = [B, C, ...D[], 1, 2, a: E, b: F];");
		expect(
			ms.filter((m) => m.mutator === "tuple-swap").map((m) => m.mutated),
		).toEqual([
			"type A = [C, B, ...D[], 1, 2, a: E, b: F];",
			"type A = [B, C, ...D[], 2, 1, a: E, b: F];",
		]);
	});

	test("sibling branches swap their numbers (binding powers)", async () => {
		const text =
			'type P<W> = W extends "and" ? (B<2> extends true ? C<"and", 3> : 0)\n  : W extends "or" ? (B<1> extends true ? C<"or", 2> : 0)\n  : 0;';
		const ms = (await mutants(text)).filter(
			(m) => m.mutator === "sibling-swap",
		);
		expect(ms.map((m) => m.mutated)).toEqual([
			'type P<W> = W extends "and" ? (B<1> extends true ? C<"and", 2> : 0)\n  : W extends "or" ? (B<2> extends true ? C<"or", 3> : 0)\n  : 0;',
		]);
	});

	test("infer constraints are dropped", async () => {
		const ms = await mutants(
			"type A<T> = T extends [infer X extends string] ? X : 0;",
		);
		expect(
			ms.filter((m) => m.mutator === "infer-bare").map((m) => m.mutated),
		).toEqual(["type A<T> = T extends [infer X] ? X : 0;"]);
	});
});

describe("bookkeeping", () => {
	test("positions are 1-based lines and columns", () => {
		const starts = lineStarts("ab\ncd\n");
		expect(position(starts, 0)).toEqual({ line: 1, column: 1 });
		expect(position(starts, 4)).toEqual({ line: 2, column: 2 });
	});

	test("changed lines from git diff -U0, deletions mark the lines around the gap", () => {
		const diff = [
			"diff --git a/x.ts b/x.ts",
			"--- a/x.ts",
			"+++ b/x.ts",
			"@@ -3 +3 @@",
			"-a",
			"+b",
			"@@ -10,2 +12,3 @@",
			"@@ -20,2 +22,0 @@",
			"+++ /dev/null",
		].join("\n");
		expect([...parseDiff(diff).get("x.ts")!].sort((a, b) => a - b)).toEqual([
			3, 12, 13, 14, 22, 23,
		]);
	});

	test("equivalence markers, with and without a mutator list", () => {
		const markers = equivalenceMarkers(
			[
				"type A = 1; // type-mutate: equivalent – unreachable",
				"type B = 2; // type-mutate: equivalent cond-swap, never-true - same type",
				"type C = 3; // type-mutate: equivalent",
				"type D = 4; // type-mutate: equivalent nonsense – x",
			].join("\n"),
		);
		expect([...markers.keys()]).toEqual([1, 2]);
		expect(equivalence(markers, new Set([1]), "bool-flip")).toBe("unreachable");
		expect(equivalence(markers, new Set([2]), "never-true")).toBe("same type");
		expect(equivalence(markers, new Set([2]), "bool-flip")).toBeUndefined();
	});

	test("ids do not depend on the position in the file", () => {
		const m = {
			mutator: "bool-flip",
			scope: "A",
			original: "true",
			text: "false",
		};
		const a = assignIds("f.ts", [m, m, { ...m, scope: "B" }]);
		expect(a).toEqual([
			"f.ts#bool-flip#A#28bed6fd60",
			"f.ts#bool-flip#A#28bed6fd60#1",
			"f.ts#bool-flip#B#28bed6fd60",
		]);
	});

	test("--sites and --shard", () => {
		const sites = parseSites("narrow.ts:60-70,expr.ts:71");
		expect(
			sites("packages/core/src/engine/binder/narrow.ts", new Set([65])),
		).toBe(true);
		expect(
			sites("packages/core/src/engine/binder/narrow.ts", new Set([71])),
		).toBe(false);
		expect(
			sites("packages/core/src/engine/parser/expr.ts", new Set([71])),
		).toBe(true);
		expect(() => parseShard("0/4")).toThrow();
		const shard = parseShard("2/3");
		expect([0, 1, 2, 3, 4, 5].filter((i) => inShard(i, shard))).toEqual([1, 4]);
	});

	test("test order: the kill map's file first, then kills in the same source file, then overall", () => {
		const tests = fallbackOrder([
			"b.test.ts",
			"z.test-d.ts",
			"a.test-d.ts",
			"helper.ts",
		]);
		expect(tests).toEqual([
			"a.test-d.ts",
			"z.test-d.ts",
			"helper.ts",
			"b.test.ts",
		]);
		const order = new TestOrder(tests, {
			version: 1,
			updated: null,
			commit: null,
			sites: {
				"s.ts#m#A#1": "b.test.ts",
				"s.ts#m#A#2": "z.test-d.ts",
				"t.ts#m#A#1": "helper.ts",
				"t.ts#m#A#2": "helper.ts",
				"gone.ts#m#A#1": "gone.test-d.ts",
			},
		});
		expect(order.order("s.ts#m#A#1", "s.ts")[0]).toBe("b.test.ts");
		expect(order.order("s.ts#m#A#9", "s.ts")).toEqual([
			"z.test-d.ts",
			"b.test.ts",
			"helper.ts",
			"a.test-d.ts",
		]);
		expect(order.order("u.ts#m#A#1", "u.ts")).toEqual([
			"helper.ts",
			"z.test-d.ts",
			"b.test.ts",
			"a.test-d.ts",
		]);
	});

	test("kill map updates, reports merge, summaries", () => {
		const map = readKillMap(
			JSON.stringify({ version: 1, sites: { a: "t1", b: "t1", c: "t2" } }),
		);
		expect(readKillMap("not json").sites).toEqual({});
		const mutant = (
			id: string,
			status: Status,
			extra: Partial<MutantResult> = {},
		): MutantResult => ({
			id,
			file: "f.ts",
			line: 1,
			column: 1,
			mutator: "bool-flip",
			description: "d",
			original: "true",
			mutated: "false",
			status,
			...extra,
		});
		const next = updateKillMap(map, [
			mutant("a", "survived"),
			mutant("d", "killed", { killedBy: "t3" }),
		]);
		expect(next.sites).toEqual({ b: "t1", c: "t2", d: "t3" });
		expect(
			updateKillMap(map, [mutant("d", "killed", { killedBy: "t3" })], {
				prune: true,
			}).sites,
		).toEqual({ d: "t3" });

		const shard = (index: number, mutants: MutantResult[]): Report => ({
			version: 1,
			mode: "full",
			shard: { index, count: 2 },
			files: ["f.ts"],
			durationMs: 1,
			summary: summarize(mutants),
			mutants,
		});
		const merged = mergeReports([
			shard(1, [mutant("a", "killed", { killedBy: "t" })]),
			shard(2, [mutant("b", "survived"), mutant("c", "invalid")]),
		]);
		expect(merged.complete).toBe(true);
		expect(merged.summary).toEqual({
			total: 3,
			killed: 1,
			timeout: 0,
			survived: 1,
			equivalent: 0,
			invalid: 1,
			score: 50,
		});
		expect(mergeReports([shard(1, [])]).complete).toBe(false);
		const md = markdownSummary(merged);
		expect(md).toContain("| `f.ts` | 3 | 1 | 1 | 0 | 1 | 50% |");
		expect(md).toContain("- `f.ts:1:1` **bool-flip**");
	});
});

describe("runs over the fixture project", { timeout: 120_000 }, () => {
	const run = (cwd: string, args: string[], env: Record<string, string> = {}) =>
		spawnSync(
			process.execPath,
			[
				script,
				"--root",
				cwd,
				"--project",
				"tsconfig.json",
				"--mutate",
				"src/**",
				...args,
			],
			{
				cwd,
				encoding: "utf8",
				env: { ...process.env, ...env, GITHUB_STEP_SUMMARY: "" },
			},
		);

	test("a full run: killed, survived, marked equivalent and invalid mutants, a report and a kill map", () => {
		const out = mkdtempSync(join(tmpdir(), "type-mutate-"));
		try {
			const r = run(fixture, [
				"--report",
				join(out, "r.json"),
				"--summary",
				join(out, "s.md"),
				"--kill-map",
				join(out, "k.json"),
			]);
			expect(r.status, r.stderr).toBe(0);
			const report = JSON.parse(
				readFileSync(join(out, "r.json"), "utf8"),
			) as Report<RunMutant>;
			const status = (line: number, mutator: string) =>
				report.mutants
					.filter((m) => m.line === line && m.mutator === mutator)
					.map((m) => m.status);
			expect(status(7, "sibling-swap")).toEqual(["killed"]);
			expect(status(8, "cond-false")).toEqual(["survived"]);
			expect(status(10, "tuple-swap")).toEqual(["killed"]);
			expect(status(18, "never-false")).toEqual(["equivalent"]);
			expect(status(18, "never-true")).toEqual(["killed"]);
			// dropping "not" breaks `Power<"not">` in the mutated file itself
			expect(
				report.mutants.find(
					(m) => m.mutator === "union-drop" && m.original.includes('"not"'),
				)!.status,
			).toBe("invalid");
			expect(
				report.mutants.find(
					(m) => m.mutator === "union-drop" && m.original.includes('"and"'),
				)!.killedBy,
			).toBe("test/logic.test-d.ts");
			const survivor = report.mutants.find((m) => m.status === "survived")!;
			expect(survivor.tried).toEqual([
				"test/logic.test-d.ts",
				"test/more.test-d.ts",
			]);
			expect(survivor.file).toBe("src/logic.ts");
			expect(report.summary.total).toBe(report.mutants.length);
			expect(readFileSync(join(out, "s.md"), "utf8")).toContain(
				"### Survivors",
			);
			const killMap = JSON.parse(
				readFileSync(join(out, "k.json"), "utf8"),
			) as KillMap;
			const killed = report.mutants.filter((m) => m.status === "killed");
			expect(Object.keys(killMap.sites).sort()).toEqual(
				killed.map((m) => m.id).sort(),
			);

			const m = spawnSync(
				process.execPath,
				[
					script,
					"merge",
					"--report",
					join(out, "m.json"),
					"--kill-map",
					join(out, "k2.json"),
					join(out, "r.json"),
				],
				{ encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } },
			);
			expect(m.status, m.stderr).toBe(0);
			const merged = JSON.parse(
				readFileSync(join(out, "m.json"), "utf8"),
			) as Report;
			expect(merged.complete).toBe(true);
			expect(merged.summary).toEqual(report.summary);
			expect(
				(JSON.parse(readFileSync(join(out, "k2.json"), "utf8")) as KillMap)
					.sites,
			).toEqual(killMap.sites);
		} finally {
			rmSync(out, { recursive: true, force: true });
		}
	});

	test("--changed: only mutants on changed lines; a survivor fails unless marked equivalent", () => {
		const repo = mkdtempSync(join(tmpdir(), "type-mutate-"));
		try {
			cpSync(fixture, repo, { recursive: true });
			const git = (...args: string[]) =>
				execFileSync(
					"git",
					[
						"-c",
						"user.name=t",
						"-c",
						"user.email=t@t",
						"-c",
						"commit.gpgsign=false",
						...args,
					],
					{ cwd: repo, encoding: "utf8" },
				);
			git("init", "-q", "-b", "main");
			git("add", ".");
			git("commit", "-q", "-m", "fixture");
			const file = join(repo, "src/logic.ts");
			const original = readFileSync(file, "utf8");
			const killMap = ["--kill-map", join(repo, "k.json")];

			// touches line 8, the untested `O extends "or"` branch
			writeFileSync(file, original.replace("Pair<1, 2>", "Pair<1, 2 >"));
			let r = run(
				repo,
				["--changed", "--report", join(repo, "r.json"), ...killMap],
				{ BASE: "main" },
			);
			expect(r.status, r.stderr).toBe(1);
			let report = JSON.parse(
				readFileSync(join(repo, "r.json"), "utf8"),
			) as Report<RunMutant>;
			expect(report.mode).toBe("changed");
			expect(new Set(report.mutants.map((m) => m.line))).toEqual(
				new Set([7, 8]),
			);
			expect(
				report.mutants
					.filter((m) => m.status === "survived")
					.map((m) => m.mutator),
			).toContain("cond-false");

			writeFileSync(
				file,
				original
					.replace(
						"Pair<1, 2>",
						"Pair<1, 2> // type-mutate: equivalent – for the test",
					)
					.replace(
						'O extends "and" ? Pair<2, 3>',
						'O extends "and" ? Pair<2, 3> // type-mutate: equivalent – for the test',
					),
			);
			r = run(
				repo,
				["--changed", "--report", join(repo, "r.json"), ...killMap],
				{ BASE: "main" },
			);
			expect(r.status, r.stderr).toBe(0);
			report = JSON.parse(
				readFileSync(join(repo, "r.json"), "utf8"),
			) as Report<RunMutant>;
			expect(report.summary.survived).toBe(0);
			expect(
				report.mutants.every(
					(m) => m.status === "equivalent" && m.checks === 0,
				),
			).toBe(true);
			r = run(
				repo,
				[
					"--changed",
					"--check-equivalent",
					"--report",
					join(repo, "r.json"),
					...killMap,
				],
				{ BASE: "main" },
			);
			expect(r.status, r.stderr).toBe(0);
			report = JSON.parse(
				readFileSync(join(repo, "r.json"), "utf8"),
			) as Report<RunMutant>;
			expect(report.mutants.some((m) => m.status === "killed")).toBe(true);
			expect(
				report.mutants
					.filter((m) => m.status === "equivalent")
					.every((m) => m.checks > 0),
			).toBe(true);

			writeFileSync(file, original);
			r = run(repo, ["--changed"], { BASE: "main" });
			expect(r.status, r.stderr).toBe(0);
			expect(r.stderr).toContain("0 mutant(s)");
		} finally {
			rmSync(repo, { recursive: true, force: true });
		}
	});
});
