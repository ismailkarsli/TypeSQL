/** `Session` against fake API clients: which client it keeps, which snapshot a request reads, and closing. */
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { SyntaxKind } from "typescript/ast";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
	type Connector,
	Session,
	type TypeScriptModules,
	typescriptModules,
} from "../src/session.js";

// pnpm's bin shims set NODE_PATH to the workspace's packages, where Node would find @typesql/core
// from anywhere; an editor has no such NODE_PATH
const nodePath = process.env.NODE_PATH;
const initPaths = (): void =>
	(Module as unknown as { _initPaths(): void })._initPaths();
const root = realpathSync(mkdtempSync(join(tmpdir(), "typesql-session-")));
beforeAll(() => {
	process.env.NODE_PATH = "";
	initPaths();
});
afterAll(() => {
	rmSync(root, { recursive: true, force: true });
	process.env.NODE_PATH = nodePath;
	initPaths();
});

// a file of this package, which finds the workspace's @typesql/core
const URI = pathToFileURL(join(import.meta.dirname, "fixture.ts")).href;
const AT = { line: 0, character: 0 };

interface Counts {
	opened: number;
	closed: number;
	disposed: number;
	temporary: number;
	/** Requests for the file's project, per snapshot. */
	projects: { server: number; temporary: number };
}

/** A project whose program has the file with `text` (or not), and whose requests may fail. */
const project = (
	o: { text?: string; missing?: boolean; fail?: "file" | "checker" } = {},
) => ({
	program: {
		getSourceFile: async () => {
			if (o.fail === "file") throw new Error("file failed");
			const text = o.text ?? "";
			// no call in it: completions are null
			return o.missing
				? undefined
				: {
						text,
						pos: 0,
						end: text.length,
						kind: -1,
						forEachChild: () => {},
						getPositionOfLineAndCharacter: () => 0,
					};
		},
	},
	checker: {
		getStringType: async () => {
			if (o.fail === "checker") throw new Error("checker failed");
			return {};
		},
	},
});

/** TypeScript modules at `dir` whose client finds `projectFor()` for the file. */
function client(
	counts: Counts,
	projectFor: () => Promise<unknown>,
	o: { dir?: string; close?: () => Promise<void> } = {},
): () => Promise<TypeScriptModules> {
	const snapshot = (kind: "server" | "temporary") => ({
		getDefaultProjectForFile: async () => {
			counts.projects[kind]++;
			return projectFor();
		},
		dispose: async () => {
			counts.disposed++;
		},
	});
	const api = {
		getCurrentLanguageServerSnapshot: async () => snapshot("server"),
		runWithTemporaryFileUpdate: async (
			_base: unknown,
			_file: unknown,
			_text: string,
			cb: (s: unknown) => Promise<void>,
		) => {
			counts.temporary++;
			await cb(snapshot("temporary"));
		},
		close: async () => {
			counts.closed++;
			await o.close?.();
		},
	};
	return async () => ({
		API: {
			fromLSPConnection: async () => {
				counts.opened++;
				return api;
			},
		} as never,
		SyntaxKind: SyntaxKind as unknown as Record<string, number>,
		dir: o.dir ?? "/ts",
		version: "7.1.0",
	});
}

const counts = (): Counts => ({
	opened: 0,
	closed: 0,
	disposed: 0,
	temporary: 0,
	projects: { server: 0, temporary: 0 },
});

function session(modules: Connector["modules"]) {
	const log: string[] = [];
	const s = new Session({ pipe: async () => "pipe", modules }, (m) => {
		if (!m.startsWith("using @typesql/core")) log.push(m);
	});
	return { s, log };
}

test("typescriptModules: the API, the kinds, the directory and the version", async () => {
	const dir = join(root, "app/node_modules/typescript");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "package.json"),
		JSON.stringify({
			name: "typescript",
			type: "module",
			exports: {
				"./package.json": "./package.json",
				"./async": "./async.js",
				"./ast": "./ast.js",
			},
		}),
	);
	writeFileSync(join(dir, "async.js"), "export const API = 'api';\n");
	writeFileSync(join(dir, "ast.js"), "export const SyntaxKind = { A: 1 };\n");
	expect(await typescriptModules(join(root, "app/q.ts"))).toEqual({
		API: "api",
		SyntaxKind: { A: 1 },
		dir,
		// a manifest without one
		version: "unknown",
	});
});

test("candidates: one that does not load is skipped, an installation is tried once, each failure is logged", async () => {
	const c = counts();
	const failing = async () => {
		throw new Error("api: client error: project  not found");
	};
	const refusing = async () => {
		throw "refused";
	};
	const { s, log } = session(() => [
		async () => {
			throw new Error("not installed");
		},
		client(c, failing, { dir: "/a" }),
		client(c, failing, { dir: "/a" }),
		client(c, failing, {
			dir: "/b",
			// closing the client that does not match fails too
			close: async () => {
				throw new Error("gone");
			},
		}),
		client(c, refusing, { dir: "/c" }),
	]);
	expect(await s.complete(URI, AT)).toBeNull();
	expect(c.opened).toBe(3);
	expect(log).toEqual([
		"no TypeScript API client matches the language server; completions are off until it restarts. Tried:\n" +
			"  typescript 7.1.0 at /a: api: client error: project  not found\n" +
			"  typescript 7.1.0 at /b: api: client error: project  not found\n" +
			"  typescript 7.1.0 at /c: refused",
	]);
});

test("no candidate loads", async () => {
	const { s, log } = session(() => [
		async () => {
			throw new Error("not installed");
		},
	]);
	expect(await s.complete(URI, AT)).toBeNull();
	expect(log).toEqual([
		"no TypeScript API client matches the language server; completions are off until it restarts. Tried:\n  (no TypeScript 7.1 package found)",
	]);
});

test("a client matches when it can read the file's project, or the file has none", async () => {
	for (const [name, projectFor, error] of [
		[
			"no project",
			async () => {
				throw new Error("project failed");
			},
			"project failed",
		],
		["file", async () => project({ fail: "file" }), "file failed"],
		["checker", async () => project({ fail: "checker" }), "checker failed"],
		["ok", async () => project(), null],
		["none", async () => undefined, null],
	] as const) {
		const c = counts();
		const { s, log } = session(() => [
			client(c, projectFor, { dir: `/${name}` }),
		]);
		expect(await s.complete(URI, AT)).toBeNull();
		expect(log).toEqual([
			error === null
				? `API session open (client: typescript 7.1.0 at /${name})`
				: `no TypeScript API client matches the language server; completions are off until it restarts. Tried:\n  typescript 7.1.0 at /${name}: ${error}`,
		]);
		// the probe's snapshot, and the request's when it is open
		expect(c.disposed).toBe(error === null ? 2 : 1);
	}
});

test("a file without @typesql/core asks the server nothing", async () => {
	const c = counts();
	let asked = 0;
	const { s, log } = session(() => {
		asked++;
		return [client(c, async () => project())];
	});
	mkdirSync(join(root, "plain"), { recursive: true });
	const uri = pathToFileURL(join(root, "plain/q.ts")).href;
	expect(await s.complete(uri, AT, "")).toBeNull();
	expect(asked).toBe(0);
	expect(log).toEqual([`no @typesql/core found from ${join(root, "plain")}`]);
});

test("the request reads the server's snapshot, or one with the editor's text when the server's differs", async () => {
	const c = counts();
	let p: unknown = project({ text: "server" });
	const { s } = session(() => [client(c, async () => p)]);
	const run = async (text?: string) => {
		const before = structuredClone(c);
		expect(await s.complete(URI, AT, text)).toBeNull();
		return {
			temporary: c.temporary - before.temporary,
			server: c.projects.server - before.projects.server,
			disposed: c.disposed - before.disposed,
		};
	};
	await run();
	// no text: the server's
	expect(await run()).toEqual({ temporary: 0, server: 1, disposed: 1 });
	// the server's text
	expect(await run("server")).toEqual({ temporary: 0, server: 2, disposed: 1 });
	// the editor is ahead
	expect(await run("editor")).toEqual({
		temporary: 1,
		server: 1,
		disposed: 1,
	});
	expect(c.projects.temporary).toBe(1);
	// the file is not in the server's program, or there is no project
	p = project({ missing: true });
	expect(await run("editor")).toEqual({
		temporary: 0,
		server: 2,
		disposed: 1,
	});
	p = undefined;
	expect(await run("editor")).toEqual({
		temporary: 0,
		server: 2,
		disposed: 1,
	});
	expect(await run()).toEqual({ temporary: 0, server: 1, disposed: 1 });
});

test("close: the open client, once; nothing to close before a request or without a client", async () => {
	const c = counts();
	const { s } = session(() => [client(c, async () => undefined)]);
	await s.close();
	expect(await s.complete(URI, AT)).toBeNull();
	await s.close();
	await s.close();
	expect(c.closed).toBe(1);

	const none = session(() => []);
	expect(await none.s.complete(URI, AT)).toBeNull();
	await none.s.close();

	// a server that is gone already
	const gone = counts();
	const g = session(() => [
		client(gone, async () => undefined, {
			close: async () => {
				throw new Error("gone");
			},
		}),
	]);
	expect(await g.s.complete(URI, AT)).toBeNull();
	await g.s.close();
	expect(gone.closed).toBe(1);
});

test("close while the connection fails to open", async () => {
	const s = new Session(
		{
			pipe: async () => {
				throw new Error("no pipe");
			},
			modules: () => [client(counts(), async () => undefined)],
		},
		() => {},
	);
	const request = s.complete(URI, AT);
	const closed = s.close();
	await expect(request).rejects.toThrow("no pipe");
	await closed;
});
