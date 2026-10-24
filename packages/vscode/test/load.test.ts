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
import { editorPath } from "../src/load.js";

// pnpm's bin shims set NODE_PATH to the workspace's packages, where Node would find @typesql/core
// from anywhere; the extension host has no such NODE_PATH
const nodePath = process.env.NODE_PATH;
const initPaths = (): void =>
	(Module as unknown as { _initPaths(): void })._initPaths();
beforeAll(() => {
	process.env.NODE_PATH = "";
	initPaths();
});

const root = realpathSync(mkdtempSync(join(tmpdir(), "typesql-vscode-")));
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
const CORE = {
	".": { default: "./dist/index.js" },
	"./editor": { default: "./dist/editor/index.js" },
};

test("@typesql/core next to the project", () => {
	pkg("app/node_modules/@typesql/core", "@typesql/core", CORE);
	write("app/src/q.ts", "");
	expect(editorPath(join(root, "app/src/q.ts"))).toBe(
		join(root, "app/node_modules/@typesql/core/dist/editor/index.js"),
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
	expect(editorPath(join(root, "pnpm-app/src/q.ts"))).toBe(
		join(
			root,
			"store/@typesql/pg/node_modules/@typesql/core/dist/editor/index.js",
		),
	);
});

test("an older @typesql/core without the editor export, or none", () => {
	pkg("old/node_modules/@typesql/core", "@typesql/core", {
		".": { default: "./dist/index.js" },
	});
	write("old/src/q.ts", "");
	expect(editorPath(join(root, "old/src/q.ts"))).toBeNull();
	write("none/src/q.ts", "");
	expect(editorPath(join(root, "none/src/q.ts"))).toBeNull();
});
