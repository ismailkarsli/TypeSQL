import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { CorePaths, corePackage } from "../src/core.js";

// pnpm's bin shims set NODE_PATH to the workspace's packages, where Node would find @typesql/core
// from anywhere; the editor has no such NODE_PATH
const nodePath = process.env.NODE_PATH;
const initPaths = (): void =>
	(Module as unknown as { _initPaths(): void })._initPaths();
beforeAll(() => {
	process.env.NODE_PATH = "";
	initPaths();
});

const root = realpathSync(
	mkdtempSync(join(tmpdir(), "typesql-language-server-")),
);
afterAll(() => {
	rmSync(root, { recursive: true, force: true });
	process.env.NODE_PATH = nodePath;
	initPaths();
});

const write = (file: string, text: string): void => {
	mkdirSync(dirname(join(root, file)), { recursive: true });
	writeFileSync(join(root, file), text);
};
const pkg = (dir: string, name: string, exports: object): void => {
	write(
		`${dir}/package.json`,
		JSON.stringify({ name, type: "module", exports }),
	);
	for (const target of Object.values(exports) as { default: string }[])
		write(join(dir, target.default), "export {};\n");
};
const CORE = { ".": { default: "./dist/index.js" } };

test("@typesql/core next to the project", () => {
	pkg("app/node_modules/@typesql/core", "@typesql/core", CORE);
	write("app/src/q.ts", "");
	expect(corePackage(join(root, "app/src/q.ts"))).toBe(
		join(root, "app/node_modules/@typesql/core"),
	);
});

test("@typesql/core only as an adapter's dependency (pnpm layout)", () => {
	pkg("store/@typesql/pg/node_modules/@typesql/core", "@typesql/core", CORE);
	pkg("store/@typesql/pg", "@typesql/pg", {
		".": { default: "./dist/index.js" },
	});
	mkdirSync(join(root, "pnpm-app/node_modules/@typesql"), { recursive: true });
	// a symlink, as pnpm makes it: resolution follows it to the store
	symlinkSync(
		join(root, "store/@typesql/pg"),
		join(root, "pnpm-app/node_modules/@typesql/pg"),
		"dir",
	);
	write("pnpm-app/src/q.ts", "");
	expect(corePackage(join(root, "pnpm-app/src/q.ts"))).toBe(
		join(root, "store/@typesql/pg/node_modules/@typesql/core"),
	);
});

test("no @typesql/core", () => {
	write("none/src/q.ts", "");
	expect(corePackage(join(root, "none/src/q.ts"))).toBeNull();
});

test("CorePaths: one lookup per directory, a log line per package; paths in its dist and src", () => {
	pkg("multi/node_modules/@typesql/core", "@typesql/core", CORE);
	write("multi/a/q.ts", "");
	write("multi/b/q.ts", "");
	write("missing/q.ts", "");
	const log: string[] = [];
	const cores = new CorePaths((m) => log.push(m));
	const a = cores.for(join(root, "multi/a/q.ts"));
	expect(cores.for(join(root, "multi/a/r.ts"))).toBe(a);
	const b = cores.for(join(root, "multi/b/q.ts"));
	expect(b).not.toBe(a);
	expect(cores.for(join(root, "missing/q.ts"))).toBeNull();
	expect(cores.for(join(root, "missing/r.ts"))).toBeNull();
	expect(log).toEqual([
		`using @typesql/core at ${join(root, "multi/node_modules/@typesql/core")}`,
		`no @typesql/core found from ${join(root, "missing")}`,
	]);
	const core = join(root, "multi/node_modules/@typesql/core");
	expect(
		[
			"dist/index.d.ts",
			"src/query.ts",
			"package.json",
			"distant/x.d.ts",
			"../core2/dist/x.d.ts",
		].map((f) => a?.(join(core, f))),
	).toEqual([true, true, false, false, false]);
});
