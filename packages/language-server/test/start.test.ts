/** `start()`: the proxy on the process's stdin and stdout, TypeScript started from the given root. */
import type { ChildProcess } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { connectLsp } from "../../core/test/cache/lsp.js";
import { start } from "../src/proxy.js";

const spawned = vi.hoisted((): ChildProcess[] => []);
vi.mock("node:child_process", async (importOriginal) => {
	const cp = await importOriginal<typeof import("node:child_process")>();
	return {
		...cp,
		spawn: (...args: Parameters<typeof cp.spawn>) => {
			const child = cp.spawn(...args);
			spawned.push(child);
			return child;
		},
	};
});

// pnpm's bin shims set NODE_PATH to the workspace's packages, where Node would find TypeScript
// from anywhere; an editor has no such NODE_PATH
const nodePath = process.env.NODE_PATH;
const initPaths = (): void =>
	(Module as unknown as { _initPaths(): void })._initPaths();
beforeAll(() => {
	process.env.NODE_PATH = "";
	initPaths();
});

const root = realpathSync(mkdtempSync(join(tmpdir(), "typesql-start-")));
// a project with TypeScript, and a directory without
const project = join(root, "project");
const empty = join(root, "empty");
mkdirSync(join(project, "node_modules"), { recursive: true });
mkdirSync(empty);
symlinkSync(
	resolve(import.meta.dirname, "../../../node_modules/typescript"),
	join(project, "node_modules/typescript"),
	"dir",
);
afterAll(() => {
	for (const c of spawned) c.kill();
	rmSync(root, { recursive: true, force: true });
	process.env.NODE_PATH = nodePath;
	initPaths();
});
afterEach(() => {
	vi.restoreAllMocks();
});

/** `start(dir)` on fake stdin and stdout; an LSP client on them. */
function started(dir: string) {
	const stdin = new PassThrough();
	const stdout = new PassThrough();
	const stdinGet = vi
		.spyOn(process, "stdin", "get")
		.mockReturnValue(stdin as never);
	const stdoutGet = vi
		.spyOn(process, "stdout", "get")
		.mockReturnValue(stdout as never);
	try {
		start(dir);
	} finally {
		stdinGet.mockRestore();
		stdoutGet.mockRestore();
	}
	return connectLsp(dir, stdin, stdout, () => {});
}

test("TypeScript from the given root, not the editor's workspace; the proxy exits with it", async () => {
	const exit = vi
		.spyOn(process, "exit")
		.mockImplementation((() => {}) as never);
	const lsp = started(project);
	const init = await lsp.request("initialize", {
		processId: null,
		rootUri: pathToFileURL(empty).href,
		capabilities: {},
	});
	expect(init.error).toBeUndefined();
	expect(init.result).toHaveProperty("capabilities");
	expect(spawned).toHaveLength(1);
	const child = spawned[0]!;
	// TypeScript's own log goes to the editor's log as it is
	expect(child.stderr).toBeNull();
	const exited = new Promise((r) => child.on("exit", r));
	child.kill("SIGKILL");
	await exited;
	await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
});

test("logs go to stderr", async () => {
	const stderr = vi
		.spyOn(process.stderr, "write")
		.mockImplementation(() => true);
	const lsp = started(empty);
	const init = await lsp.request("initialize", {
		processId: null,
		rootUri: pathToFileURL(project).href,
		capabilities: {},
	});
	const message = (init.error as { message: string } | undefined)?.message;
	expect(message).toMatch(
		new RegExp(`^cannot start TypeScript's language server from ${empty}: `),
	);
	expect(stderr).toHaveBeenCalledWith(`typesql: ${message}\n`);
});
