import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
	evaluateTypes,
	lineOf,
	PROBE_HEAD,
	ProbeSession,
} from "../../src/cache/evaluate.js";
import { SCHEMA, type TempProject, tempProject, tsconfig } from "./project.js";

let p: TempProject;
let isCorePath: (f: string) => boolean;
beforeAll(() => {
	p = tempProject({
		"tsconfig.json": tsconfig(),
		"src/db.ts": SCHEMA,
		"src/value.ts": "export type V = 1;\n",
	});
	isCorePath = (f) => f.startsWith(join(p.corePackage, "dist"));
}, 120_000);
afterAll(() => p?.remove());

const session = (probe = "src/__probe__.ts", config = "tsconfig.json") =>
	new ProbeSession(join(p.dir, config), join(p.dir, probe));

test("each expression is printed, or gives the first compile error on its line or in an alias it uses", async () => {
	const s = session();
	try {
		const base = `${PROBE_HEAD}import type { DB } from "./db.js";\ntype Bad = Nope;\nexport type Ex = Nope2;\ntype Good = 1;\n`;
		const exprs = [
			"Good",
			"Bad",
			"Bad[]",
			"Ex",
			"Nope3 | Nope4",
			`__T.SqlError<"m", 1>`,
			`__T.RowOf<DB, __T.DefaultTypeMap, "SELECT id FROM users">`,
			"Good | Bad2",
		];
		expect(await evaluateTypes(s, base, exprs, isCorePath)).toEqual([
			{ text: "1" },
			{ error: "TS2304: Cannot find name 'Nope'." },
			{ error: "TS2304: Cannot find name 'Nope'." },
			// only the probe's own `type X =` lines are aliases it tracks
			{ text: "Nope2" },
			{ error: "TS2304: Cannot find name 'Nope3'." },
			{ text: `__T.SqlError<"m", 1>` },
			{ text: "{ id: number; }" },
			{ error: "TS2552: Cannot find name 'Bad2'. Did you mean 'Bad'?" },
		]);
		expect(
			await evaluateTypes(
				s,
				`${PROBE_HEAD}export declare const { a }: { a: 1 };\ntype Bad = Nope; // export declare const __x_0: 1\n`,
				["1"],
				isCorePath,
			),
		).toEqual([{ text: "1" }]);
		expect(await evaluateTypes(s, PROBE_HEAD, ["2"], isCorePath)).toEqual([
			{ text: "2" },
		]);
		expect(
			await evaluateTypes(s, `${PROBE_HEAD}/*`, ["1"], isCorePath),
		).toEqual([{ error: "no declaration" }]);
	} finally {
		await s.dispose();
	}
}, 120_000);

test("the session is kept between programs: files changed on disk are seen once marked", async () => {
	const s = session();
	const v = () =>
		evaluateTypes(s, PROBE_HEAD, ['import("./value.js").V'], isCorePath);
	try {
		expect(await v()).toEqual([{ text: "1" }]);
		p.write("src/value.ts", "export type V = 2;\n");
		expect(await v()).toEqual([{ text: "1" }]);
		s.markChanged([join(p.dir, "src/value.ts")]);
		expect(await v()).toEqual([{ text: "2" }]);
		p.write("src/value.ts", "export type V = 3;\n");
		await s.close();
		expect(await v()).toEqual([{ text: "3" }]);
	} finally {
		p.write("src/value.ts", "export type V = 1;\n");
		await s.dispose();
	}
}, 120_000);

test("a disposed session refuses work; closing one that never opened is fine", async () => {
	const s = session();
	await s.close();
	await s.dispose();
	await expect(s.withProbe(PROBE_HEAD)).rejects.toThrow(
		new Error("typesql: the job was stopped"),
	);
});

test("a probe outside the project's files, a project that does not load", async () => {
	const outside = session("other/__probe__.ts");
	try {
		await expect(outside.withProbe(PROBE_HEAD)).rejects.toThrow(
			new Error(
				"typesql: other/__probe__.ts is not in a directory the project includes .ts files from",
			),
		);
	} finally {
		await outside.dispose();
	}
	const missing = session("src/__probe__.ts", "nope/tsconfig.json");
	try {
		await expect(missing.withProbe(PROBE_HEAD)).rejects.toThrow(
			new Error(
				`typesql: project ${join(p.dir, "nope/tsconfig.json")} did not load`,
			),
		);
	} finally {
		await missing.dispose();
	}
}, 120_000);

test("lineOf counts the newlines before an offset", () => {
	expect(lineOf("a\nb\nc", 0)).toBe(0);
	expect(lineOf("a\nb\nc", 2)).toBe(1);
	expect(lineOf("a\nb\nc", 4)).toBe(2);
	expect(lineOf("a\nb\n", 99)).toBe(2);
	expect(lineOf("a\nb", 1)).toBe(0);
	expect(lineOf("ab\nc", 4)).toBe(1);
	expect(lineOf("a\nb\n", Number.MAX_SAFE_INTEGER)).toBe(2);
});
