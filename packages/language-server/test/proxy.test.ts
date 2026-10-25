/** The proxy in front of `tsc --lsp --stdio`, and in front of a fake server. */
import type { ChildProcess } from "node:child_process";
import Module from "node:module";
import { PassThrough } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { connectLsp, type Lsp } from "../../core/test/cache/lsp.js";
import {
	SCHEMA,
	type TempProject,
	tempProject,
	tsconfig,
} from "../../core/test/cache/project.js";
import { proxy, type Server, spawnTypeScript } from "../src/proxy.js";

let p: TempProject;
let lsp: Lsp;
let child: ChildProcess | undefined;
const roots: string[] = [];
const logs: string[] = [];

// pnpm's bin shims set NODE_PATH to the workspace's packages, where Node would find @typesql/core
// from anywhere; an editor has no such NODE_PATH
const nodePath = process.env.NODE_PATH;
const initPaths = (): void =>
	(Module as unknown as { _initPaths(): void })._initPaths();

beforeAll(async () => {
	process.env.NODE_PATH = "";
	initPaths();
	p = tempProject({ "tsconfig.json": tsconfig(), "src/db.ts": SCHEMA });
	const editor = { readable: new PassThrough(), writable: new PassThrough() };
	proxy(
		editor,
		async (root) => {
			roots.push(root);
			const started = await spawnTypeScript(root);
			child = started.child;
			return started.server;
		},
		(m) => logs.push(m),
		// the first request opens the API session and loads the project
		30_000,
	);
	lsp = connectLsp(p.dir, editor.readable, editor.writable, () =>
		child?.kill(),
	);
	const init = await lsp.request("initialize", {
		processId: process.pid,
		rootUri: null,
		workspaceFolders: [{ uri: lsp.uri("."), name: "project" }],
		capabilities: { general: { positionEncodings: ["utf-8", "utf-16"] } },
		initializationOptions: {},
	});
	const { capabilities } = init.result as {
		capabilities: { positionEncoding?: string };
	};
	expect(capabilities.positionEncoding ?? "utf-16").toBe("utf-16");
	expect(roots).toEqual([p.dir]);
	lsp.notify("initialized", {});
}, 60_000);

afterAll(async () => {
	await lsp?.close();
	p?.remove();
	process.env.NODE_PATH = nodePath;
	initPaths();
});

interface Item {
	label: string;
	detail?: string;
}

const split = (marked: string) => {
	const offset = marked.indexOf("|");
	const before = marked.slice(0, offset).split("\n");
	return {
		text: marked.replace("|", ""),
		position: {
			line: before.length - 1,
			character: before.at(-1)?.length ?? 0,
		},
	};
};

const open = (file: string, text: string): string => {
	const uri = lsp.uri(file);
	lsp.notify("textDocument/didOpen", {
		textDocument: { uri, languageId: "typescript", version: 1, text },
	});
	return uri;
};

const complete = async (
	uri: string,
	position: { line: number; character: number },
): Promise<Item[]> => {
	const r = (
		await lsp.request("textDocument/completion", {
			textDocument: { uri },
			position,
		})
	).result as Item[] | { items: Item[] } | null;
	return r === null ? [] : Array.isArray(r) ? r : r.items;
};

test("adds the columns in scope and drops TypeScript's item with the statement", async () => {
	const { text, position } = split(
		`import { sql } from "./db.js";\nsql("SELECT u.| FROM users u");\n`,
	);
	const items = await complete(open("src/a.ts", text), position);
	expect(items.map((i) => [i.label, i.detail])).toEqual([
		["id", "int4"],
		["email", "text"],
		["name", "text | null"],
	]);
	expect(logs).toContain(`using @typesql/core at ${p.corePackage}`);
	expect(logs.some((l) => /^3 items in \d+ ms$/.test(l))).toBe(true);
}, 60_000);

test("follows the editor's edits, incremental and whole", async () => {
	const uri = open(
		"src/b.ts",
		`import { sql } from "./db.js";\nsql("SELECT 1");\n`,
	);
	lsp.notify("textDocument/didChange", {
		textDocument: { uri, version: 2 },
		contentChanges: [
			{
				range: {
					start: { line: 1, character: 12 },
					end: { line: 1, character: 13 },
				},
				text: "p. FROM posts p",
			},
		],
	});
	const columns = await complete(uri, { line: 1, character: 14 });
	expect(columns.map((i) => i.label)).toEqual(["id", "author_id", "title"]);

	const { text, position } = split(
		`import { sql } from "./db.js";\nsql("SELECT * FROM |");\n`,
	);
	lsp.notify("textDocument/didChange", {
		textDocument: { uri, version: 3 },
		contentChanges: [{ text }],
	});
	const relations = await complete(uri, position);
	expect(relations.map((i) => i.label)).toEqual(
		expect.arrayContaining(["users", "posts"]),
	);
}, 60_000);

test("outside a statement literal, and after the document closes: TypeScript's answers only", async () => {
	const { text, position } = split(
		`import { sql } from "./db.js";\nsql("SELECT 1");\nsql.|\n`,
	);
	const uri = open("src/c.ts", text);
	const before = logs.length;
	const members = await complete(uri, position);
	expect(members.map((i) => i.label)).toContain("fragment");
	lsp.notify("textDocument/didClose", { textDocument: { uri } });
	const closed = await lsp.request("textDocument/completion", {
		textDocument: { uri },
		position: { line: 1, character: 12 },
	});
	expect(closed.error).toBeDefined();
	expect(logs.slice(before)).toEqual([]);
}, 60_000);

const KINDS = {
	CallExpression: 1,
	PropertyAccessExpression: 2,
	StringLiteral: 3,
	NoSubstitutionTemplateLiteral: 4,
	TemplateExpression: 5,
};
// a file of this package, which finds the workspace's @typesql/core
const URI = pathToFileURL(
	fileURLToPath(new URL("fixture.ts", import.meta.url)),
).href;
const TEXT = 'sql("SELECT * FROM ';
const ITEMS = [{ label: "fromServer" }];

/**
 * A proxy in front of a fake server with the API `api`, which answers each request with
 * `answer(method)`; starting it fails when `api` is null.
 */
function fake(
	api: unknown,
	answer: (method: string) => { result?: unknown; error?: unknown } = () => ({
		result: ITEMS,
	}),
	// the first lookup finds @typesql/core, which can take a while under coverage
	budget = 10_000,
) {
	const log: string[] = [];
	const roots: string[] = [];
	const editor = { readable: new PassThrough(), writable: new PassThrough() };
	const server = { readable: new PassThrough(), writable: new PassThrough() };
	const client = connectLsp("/", editor.readable, editor.writable, () => {});
	let buffer = "";
	server.writable.on("data", (d: Buffer) => {
		buffer += d.toString();
		for (;;) {
			const m = /^Content-Length: (\d+)\r\n\r\n/.exec(buffer);
			if (!m || buffer.length < m[0].length + Number(m[1])) return;
			const msg = JSON.parse(
				buffer.slice(m[0].length, m[0].length + Number(m[1])),
			) as { id?: number | string; method: string };
			buffer = buffer.slice(m[0].length + Number(m[1]));
			if (msg.id === undefined) continue;
			const body = JSON.stringify({
				jsonrpc: "2.0",
				id: msg.id,
				...answer(msg.method),
			});
			server.readable.write(`Content-Length: ${body.length}\r\n\r\n${body}`);
		}
	});
	proxy(
		editor,
		async (root): Promise<Server> => {
			roots.push(root);
			if (api === null) throw new Error("no typescript here");
			return {
				...server,
				ts: {
					API: api as never,
					SyntaxKind: KINDS,
					dir: "/ts",
					version: "7.1.0",
				},
			};
		},
		(m) => {
			if (!m.startsWith("using @typesql/core")) log.push(m);
		},
		budget,
	);
	return {
		log,
		roots,
		server,
		editor,
		client,
		initialize: (params: object = {}) =>
			client.request("initialize", { capabilities: {}, ...params }),
		open(uri = URI, text = TEXT) {
			client.notify("textDocument/didOpen", { textDocument: { uri, text } });
		},
		complete: async (uri = URI) =>
			(
				await client.request("textDocument/completion", {
					textDocument: { uri },
					position: { line: 0, character: TEXT.length },
				})
			).result,
	};
}

test("the root is the first workspace folder, the root URI, the root path or the current directory", async () => {
	for (const [params, root] of [
		[{ rootUri: pathToFileURL("/a").href }, "/a"],
		[{ workspaceFolders: null, rootUri: null, rootPath: "/b" }, "/b"],
		[{}, process.cwd()],
	] as const) {
		const f = fake({});
		await f.initialize(params);
		expect(f.roots).toEqual([root]);
	}
});

test("a server that does not start: the editor's initialize request fails", async () => {
	const f = fake(null);
	const r = await f.initialize({ rootPath: "/nowhere" });
	const message =
		"cannot start TypeScript's language server from /nowhere: no typescript here";
	expect(r.error).toEqual({ code: -32603, message });
	expect(f.log).toEqual([message]);
});

test("an error from the server, unknown documents and text outside a literal pass through", async () => {
	let error = true;
	const f = fake({}, (method) =>
		error && method === "textDocument/completion"
			? { error: { code: -32800, message: "cancelled" } }
			: { result: ITEMS },
	);
	await f.initialize();
	f.open();
	const r = await f.client.request("textDocument/completion", {
		textDocument: { uri: URI },
		position: { line: 0, character: TEXT.length },
	});
	expect(r.error).toEqual({ code: -32800, message: "cancelled" });
	error = false;
	f.client.notify("textDocument/didChange", {
		textDocument: { uri: "file:///unknown.ts" },
		contentChanges: [{ text: "x" }],
	});
	expect(await f.complete("file:///unknown.ts")).toEqual(ITEMS);
	f.open("file:///outside.ts", "const a = 1 + ");
	expect(await f.complete("file:///outside.ts")).toEqual(ITEMS);
	expect(f.log).toEqual([]);
});

test("failing and late lookups add nothing and are logged", async () => {
	const noSession = fake({}, (method) =>
		method === "custom/initializeAPISession"
			? { error: { code: -32601, message: "unhandled method" } }
			: { result: ITEMS },
	);
	await noSession.initialize();
	noSession.open();
	expect(await noSession.complete()).toEqual(ITEMS);
	expect(noSession.log.map((l) => l.split("\n")[0])).toEqual([
		'Error: {"code":-32601,"message":"unhandled method"}',
	]);

	const pipe = (method: string) => ({
		result: method === "custom/initializeAPISession" ? { pipe: "pipe" } : ITEMS,
	});
	const refused = fake(
		{ fromLSPConnection: () => Promise.reject("refused") },
		pipe,
	);
	await refused.initialize();
	refused.open();
	expect(await refused.complete()).toEqual(ITEMS);
	expect(refused.log).toEqual(["refused"]);

	const late = fake(
		{ fromLSPConnection: () => new Promise(() => {}) },
		pipe,
		20,
	);
	await late.initialize();
	late.open();
	expect(await late.complete()).toEqual(ITEMS);
	expect(late.log).toEqual(["completions took longer than 20 ms; skipped"]);
});

test("the editor's end closes the server's input", async () => {
	const f = fake({});
	await f.initialize();
	const ended = new Promise((r) => f.server.writable.on("finish", r));
	f.editor.readable.end();
	await ended;
});
