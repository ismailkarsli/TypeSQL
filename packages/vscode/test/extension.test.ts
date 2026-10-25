/**
 * The extension against a fake `vscode` module and fake TypeScript 7 extension APIs: what it
 * registers, what it logs, the completions it adds and when it adds none.
 */
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => {
	type Call = [level: string, ...args: unknown[]];
	interface Doc {
		uri: { toString(): string };
		getText(): string;
	}
	const state = {
		logs: [] as Call[],
		channels: [] as { name: string; options: unknown; channel: object }[],
		extensions: new Map<string, unknown>(),
		/** Settings by `section.key`. */
		config: new Map<string, unknown>(),
		textDocuments: [] as Doc[],
		workspaceFolders: undefined as { uri: { fsPath: string } }[] | undefined,
		providers: [] as {
			selector: unknown;
			provider: {
				provideCompletionItems(
					document: Doc,
					position: { line: number; character: number },
				): Promise<unknown>;
			};
			triggers: string[];
			disposable: object;
		}[],
		sessions: [] as FakeSession[],
		typescriptModules: [] as string[],
	};

	class FakeSession {
		readonly connector: {
			pipe(): Promise<string>;
			modules(fileName: string): readonly (() => Promise<unknown>)[];
			upgrade?: string;
		};
		readonly log: (message: string) => void;
		closed = 0;
		readonly calls: unknown[][] = [];
		/** What `complete` does; set by the test. */
		reply: (...args: unknown[]) => Promise<unknown> = () =>
			Promise.resolve(null);
		constructor(
			connector: FakeSession["connector"],
			log: (message: string) => void,
		) {
			this.connector = connector;
			this.log = log;
			state.sessions.push(this);
		}
		complete(...args: unknown[]): Promise<unknown> {
			this.calls.push(args);
			return this.reply(...args);
		}
		close(): Promise<void> {
			this.closed++;
			return Promise.resolve();
		}
	}

	const channel = Object.fromEntries(
		["trace", "debug", "info", "warn", "error"].map((level) => [
			level,
			(...args: unknown[]) => void state.logs.push([level, ...args]),
		]),
	);

	class CompletionItem {
		readonly label: string;
		readonly kind: number;
		detail?: string;
		sortText?: string;
		filterText?: string;
		insertText?: string;
		range?: unknown;
		constructor(label: string, kind: number) {
			this.label = label;
			this.kind = kind;
		}
	}
	class Range {
		readonly start: { line: number; character: number };
		readonly end: { line: number; character: number };
		constructor(sl: number, sc: number, el: number, ec: number) {
			this.start = { line: sl, character: sc };
			this.end = { line: el, character: ec };
		}
	}

	const vscode = {
		window: {
			createOutputChannel(name: string, options: unknown) {
				const c = { ...channel, dispose() {} };
				state.channels.push({ name, options, channel: c });
				return c;
			},
		},
		extensions: {
			getExtension: (id: string) => state.extensions.get(id),
		},
		workspace: {
			getConfiguration: (section: string) => ({
				get: (key: string, fallback?: unknown) => {
					const k = `${section}.${key}`;
					return state.config.has(k) ? state.config.get(k) : fallback;
				},
			}),
			get textDocuments() {
				return state.textDocuments;
			},
			get workspaceFolders() {
				return state.workspaceFolders;
			},
		},
		languages: {
			registerCompletionItemProvider(
				selector: unknown,
				provider: (typeof state.providers)[number]["provider"],
				...triggers: string[]
			) {
				const disposable = { dispose() {} };
				state.providers.push({ selector, provider, triggers, disposable });
				return disposable;
			},
		},
		CompletionItem,
		Range,
		CompletionItemKind: {
			Struct: 21,
			Interface: 7,
			Module: 8,
			Field: 4,
			Variable: 5,
		},
	};

	return {
		state,
		vscode,
		FakeSession,
		typescriptModules: (from: string) => {
			state.typescriptModules.push(from);
			return Promise.resolve({ from });
		},
	};
});

vi.mock("vscode", () => h.vscode);
vi.mock("@typesql/language-server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@typesql/language-server")>()),
	Session: h.FakeSession,
	typescriptModules: h.typescriptModules,
}));

import { type Completions, merge } from "@typesql/language-server";
import { activate, deactivate } from "../src/extension";

const { state } = h;
type FakeSession = InstanceType<typeof h.FakeSession>;

const TS = "TypeScriptTeam.native-preview";
const NIGHTLY = "TypeScriptTeam.vscode-typescript-nightly";
const UPGRADE =
	'Install the "TypeScript 7 Nightly" extension, or set "js/ts.tsdk.path" to a TypeScript 7.1 package and allow it.';
const LEGACY_INFO = `${TS} 1.0.0 has no LSP middleware: completions come from a separate provider, and TypeScript's item with the statement text stays in the list`;

const disposable = (name: string) => ({ name, dispose() {} });

/** The TypeScript 7.1 extension's API: an SDK per server start, and LSP middleware. */
function middlewareAPI() {
	const api = {
		listeners: [] as ((sdk: unknown) => unknown)[],
		middleware: [] as {
			method: string;
			fn: (result: unknown, context: { params: unknown }) => Promise<unknown>;
		}[],
		initialized: disposable("initialized"),
		registered: disposable("middleware"),
		onLanguageServerInitialized(listener: (sdk: unknown) => unknown) {
			api.listeners.push(listener);
			return api.initialized;
		},
		registerLspMiddleware(
			method: string,
			fn: (result: unknown, context: { params: unknown }) => Promise<unknown>,
		) {
			api.middleware.push({ method, fn });
			return api.registered;
		},
	};
	return api;
}

const PACKAGE_JSON = "/sdk/typescript/package.json";

/** The TypeScript 7 extension 1.0's API. */
function legacyAPI() {
	const api = {
		listeners: [] as (() => unknown)[],
		initialized: disposable("initialized"),
		onLanguageServerInitialized(listener: () => unknown) {
			api.listeners.push(listener);
			return api.initialized;
		},
		initializeAPIConnection: () => Promise.resolve("legacy-pipe"),
	};
	return api;
}

function install(api: unknown, version: unknown = "1.0.0") {
	state.extensions.set(TS, {
		activate: () => Promise.resolve(api),
		packageJSON: { version },
	});
}

function sdk(packageJsonPath?: string) {
	const modules: Record<string, unknown> = {
		"typescript/async": { API: "the API class" },
		"typescript/ast": { SyntaxKind: { Identifier: 80 } },
	};
	return {
		version: "7.1.0",
		packageJsonPath,
		initializeAPIConnection: () => Promise.resolve("sdk-pipe"),
		importModule: (spec: string) => Promise.resolve(modules[spec]),
	};
}

async function start() {
	const context = { subscriptions: [] as { dispose(): unknown }[] };
	await activate(context as never);
	return context;
}

function session(i = 0): FakeSession {
	const s = state.sessions[i];
	if (!s) throw new Error(`no session ${i}`);
	return s;
}

const completions = (items: Completions["items"]): Completions => ({
	items,
	literal: { start: 30, end: 46 },
	replace: { start: 38, end: 41 },
	literalRange: {
		start: { line: 1, character: 4 },
		end: { line: 1, character: 20 },
	},
	replaceRange: {
		start: { line: 1, character: 12 },
		end: { line: 1, character: 15 },
	},
});
const item = (
	label: string,
	kind: Completions["items"][number]["kind"],
): Completions["items"][number] => ({
	label,
	kind,
	detail: `${label} detail`,
	sortText: `0${label}`,
	insertText: `"${label}"`,
});

const doc = (uri: string, text: string) => ({
	uri: { toString: () => uri },
	getText: () => text,
});

beforeEach(() => {
	state.logs = [];
	state.channels = [];
	state.extensions = new Map();
	state.config = new Map();
	state.textDocuments = [];
	state.workspaceFolders = undefined;
	state.providers = [];
	state.sessions = [];
	state.typescriptModules = [];
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

test("deactivate does nothing", () => {
	expect(deactivate()).toBeUndefined();
});

describe("activation", () => {
	test("opens a log output channel, disposed with the extension", async () => {
		const context = await start();
		expect(state.channels).toEqual([
			{ name: "TypeSQL", options: { log: true }, channel: expect.anything() },
		]);
		expect(context.subscriptions).toEqual([state.channels[0]!.channel]);
	});

	test("without the TypeScript 7 extension: a warning, nothing registered", async () => {
		const context = await start();
		expect(state.logs).toEqual([
			[
				"warn",
				`${TS} is not installed: completions in sql() strings need the TypeScript 7 extension`,
			],
		]);
		expect(context.subscriptions).toHaveLength(1);
		expect(state.providers).toEqual([]);
	});

	const noAPI = (version: string) => [
		[
			"warn",
			`${TS} ${version} has no API for other extensions; no completions`,
		],
	];
	test.each([
		["no API", undefined],
		["an empty API", {}],
		[
			"middleware but no server event",
			{ registerLspMiddleware: () => disposable("m") },
		],
		[
			"a server event but neither middleware nor API connections",
			{ onLanguageServerInitialized: () => disposable("i") },
		],
		[
			"API connections but no server event",
			{ initializeAPIConnection: () => Promise.resolve("p") },
		],
	])("an extension with %s: a warning, nothing registered", async (_, api) => {
		install(api, 3);
		const context = await start();
		expect(state.logs).toEqual(noAPI("3"));
		expect(context.subscriptions).toHaveLength(1);
		expect(state.providers).toEqual([]);
	});
});

describe("with LSP middleware (TypeScript 7.1's extension)", () => {
	async function setup() {
		const api = middlewareAPI();
		install(api);
		const context = await start();
		return { api, context };
	}

	test("registers a completion middleware and a server listener, no provider", async () => {
		const { api, context } = await setup();
		expect(api.middleware.map((m) => m.method)).toEqual([
			"textDocument/completion",
		]);
		expect(api.listeners).toHaveLength(1);
		expect(context.subscriptions.slice(2)).toEqual([
			api.initialized,
			api.registered,
		]);
		expect(context.subscriptions).toHaveLength(4);
		expect(state.providers).toEqual([]);
		expect(state.logs).toEqual([]);
	});

	test("a server start opens a session on the server's own TypeScript", async () => {
		const { api } = await setup();
		api.listeners[0]!(sdk(PACKAGE_JSON));
		expect(state.logs).toEqual([
			["info", "TypeScript 7.1.0 language server initialized"],
		]);
		const { connector } = session();
		expect(connector.upgrade).toBe(UPGRADE);
		expect(await connector.pipe()).toBe("sdk-pipe");
		const modules = connector.modules("/project/a.ts");
		expect(modules).toHaveLength(1);
		expect(await modules[0]!()).toEqual({
			API: "the API class",
			SyntaxKind: { Identifier: 80 },
			dir: "/sdk/typescript",
			version: "7.1.0",
		});
		session().log("a message");
		expect(state.logs.at(-1)).toEqual(["info", "a message"]);
	});

	test("a server without a companion package says so as the directory", async () => {
		const { api } = await setup();
		api.listeners[0]!(sdk());
		const [load] = session().connector.modules("/project/a.ts");
		expect(await load!()).toMatchObject({ dir: "(TypeScript 7 extension)" });
	});

	test("a restart replaces the session and closes the old one", async () => {
		const { api } = await setup();
		api.listeners[0]!(sdk(PACKAGE_JSON));
		expect(session(0).closed).toBe(0);
		api.listeners[0]!(sdk(PACKAGE_JSON));
		expect(state.sessions).toHaveLength(2);
		expect(session(0).closed).toBe(1);
		expect(session(1).closed).toBe(0);
	});

	test("disposing the extension closes the session", async () => {
		const { api, context } = await setup();
		api.listeners[0]!(sdk(PACKAGE_JSON));
		for (const d of context.subscriptions) d.dispose();
		expect(session().closed).toBe(1);
	});

	test("disposing before the server started closes nothing", async () => {
		const { context } = await setup();
		for (const d of context.subscriptions) d.dispose();
		expect(state.sessions).toEqual([]);
	});

	const URI = "file:///project/a.ts";
	const TEXT = 'const a = sql("SELECT ';
	const position = { line: 0, character: TEXT.length };
	const params = { textDocument: { uri: URI }, position };
	const serverResult = {
		isIncomplete: false,
		items: [
			{
				label: "SELECT ",
				textEdit: {
					range: {
						start: { line: 1, character: 4 },
						end: { line: 1, character: 20 },
					},
					newText: "SELECT ",
				},
			},
			{ label: "toString" },
		],
	};

	async function middleware() {
		const { api } = await setup();
		api.listeners[0]!(sdk(PACKAGE_JSON));
		const run = (result: unknown = serverResult) =>
			api.middleware[0]!.fn(result, { params });
		return { run, s: session() };
	}

	test("adds our items to the server's and drops TypeScript's statement item", async () => {
		const { run, s } = await middleware();
		state.textDocuments = [doc("file:///project/b.ts", "b"), doc(URI, TEXT)];
		const ours = completions([item("users", "table")]);
		s.reply = () => Promise.resolve(ours);
		const result = await run();
		expect(s.calls).toEqual([[URI, position, TEXT]]);
		expect(result).toEqual(merge(serverResult, ours));
		expect(result).toEqual({
			isIncomplete: false,
			items: [
				{ label: "toString" },
				expect.objectContaining({ label: "users" }),
			],
		});
	});

	test("asks without the text when the document is not open", async () => {
		const { run, s } = await middleware();
		state.textDocuments = [doc("file:///project/b.ts", "b")];
		s.reply = () => Promise.resolve(null);
		expect(await run()).toBe(serverResult);
		expect(s.calls).toEqual([[URI, position, undefined]]);
		expect(state.logs.filter(([l]) => l !== "info")).toEqual([]);
	});

	test("before the server started: the server's items only", async () => {
		const api = middlewareAPI();
		install(api);
		await start();
		state.textDocuments = [doc(URI, TEXT)];
		expect(await api.middleware[0]!.fn(serverResult, { params })).toBe(
			serverResult,
		);
		expect(state.logs).toEqual([]);
	});
});

describe("without LSP middleware (the TypeScript 7 extension 1.0)", () => {
	async function setup() {
		const api = legacyAPI();
		install(api);
		const context = await start();
		return { api, context };
	}

	test("registers a completion provider for TypeScript and JavaScript files", async () => {
		const { api, context } = await setup();
		expect(state.logs).toEqual([["info", LEGACY_INFO]]);
		expect(state.providers).toHaveLength(1);
		const [p] = state.providers;
		expect(p!.selector).toEqual([
			{ language: "typescript", scheme: "file" },
			{ language: "typescriptreact", scheme: "file" },
			{ language: "javascript", scheme: "file" },
			{ language: "javascriptreact", scheme: "file" },
		]);
		expect(p!.triggers).toEqual([" ", ".", "(", ","]);
		expect(api.listeners).toHaveLength(1);
		expect(context.subscriptions.slice(2)).toEqual([
			api.initialized,
			p!.disposable,
		]);
		expect(context.subscriptions).toHaveLength(4);
	});

	test("a server start opens a session over the extension's API connection", async () => {
		const { api } = await setup();
		api.listeners[0]!();
		expect(state.logs.slice(1)).toEqual([
			["info", "TypeScript language server initialized"],
		]);
		const { connector } = session();
		expect(connector.upgrade).toBe(UPGRADE);
		expect(await connector.pipe()).toBe("legacy-pipe");
		session().log("a message");
		expect(state.logs.at(-1)).toEqual(["info", "a message"]);
	});

	async function candidates(fileName: string) {
		const { api } = await setup();
		api.listeners[0]!();
		const loads = session().connector.modules(fileName);
		const loaded = await Promise.all(loads.map((l) => l()));
		expect(loaded).toEqual(state.typescriptModules.map((from) => ({ from })));
		return state.typescriptModules;
	}

	test("API packages: the project's typescript", async () => {
		expect(await candidates("/project/src/a.ts")).toEqual([
			"/project/src/a.ts",
		]);
	});

	test("API packages: js/ts.tsdk.path relative to the workspace folder first", async () => {
		state.config.set("js/ts.tsdk.path", "node_modules/typescript");
		state.workspaceFolders = [
			{ uri: { fsPath: "/workspace" } },
			{ uri: { fsPath: "/other" } },
		];
		expect(await candidates("/project/src/a.ts")).toEqual([
			"/workspace/node_modules/typescript/package.json",
			"/project/src/a.ts",
		]);
	});

	test.each([
		["no workspace folders", undefined],
		["an empty workspace", []],
	])(
		"API packages: js/ts.tsdk.path relative to the file with %s",
		async (_, folders) => {
			state.config.set("js/ts.tsdk.path", "../ts");
			state.workspaceFolders = folders;
			expect(await candidates("/project/src/a.ts")).toEqual([
				"/project/ts/package.json",
				"/project/src/a.ts",
			]);
		},
	);

	test("API packages: an absolute js/ts.tsdk.path, then the nightly extension's", async () => {
		state.config.set("js/ts.tsdk.path", "/opt/ts");
		state.workspaceFolders = [{ uri: { fsPath: "/workspace" } }];
		state.extensions.set(NIGHTLY, { extensionPath: "/ext/nightly" });
		expect(await candidates("/project/src/a.ts")).toEqual([
			"/opt/ts/package.json",
			"/project/src/a.ts",
			path.join("/ext/nightly", "package.json"),
		]);
	});

	async function provider() {
		const { api } = await setup();
		api.listeners[0]!();
		const p = state.providers[0]!.provider;
		return {
			s: session(),
			provide: (text: string, line: number, character: number) =>
				p.provideCompletionItems(doc("file:///project/a.ts", text), {
					line,
					character,
				}),
		};
	}

	test("our items as VS Code items, replacing the word at the cursor", async () => {
		const { s, provide } = await provider();
		const kinds = [
			"table",
			"view",
			"cte",
			"namespace",
			"column",
			"alias",
		] as const;
		s.reply = () =>
			Promise.resolve(completions(kinds.map((k) => item(`${k}1`, k))));
		const text = 'sql("SELECT ';
		const items = await provide(text, 0, text.length);
		expect(s.calls).toEqual([
			["file:///project/a.ts", { line: 0, character: text.length }, text],
		]);
		const range = {
			start: { line: 1, character: 12 },
			end: { line: 1, character: 15 },
		};
		expect(items).toEqual(
			[21, 7, 21, 8, 4, 5].map((kind, i) => {
				const label = `${kinds[i]}1`;
				return Object.assign(new h.vscode.CompletionItem(label, kind), {
					detail: `${label} detail`,
					sortText: `0${label}`,
					filterText: label,
					insertText: `"${label}"`,
					range: new h.vscode.Range(1, 12, 1, 15),
				});
			}),
		);
		expect((items as { range: unknown }[])[0]!.range).toEqual(range);
	});

	test("outside a statement literal: no items, the server is not asked", async () => {
		const { s, provide } = await provider();
		s.reply = () => Promise.resolve(completions([item("users", "table")]));
		expect(await provide('sql("a") + b', 0, 12)).toBeUndefined();
		expect(s.calls).toEqual([]);
	});

	test("no items where the session has none", async () => {
		const { s, provide } = await provider();
		expect(await provide('sql("', 0, 5)).toBeUndefined();
		expect(s.calls).toHaveLength(1);
		expect(state.logs.filter(([l]) => l !== "info")).toEqual([]);
	});

	// the cursor's line and character as an offset in the text
	test.each([
		["inside, on the second line", 'x\nsql("SEL")', 1, 6, true],
		["after the literal, on the second line", 'x\nsql("SEL")', 1, 11, false],
		["inside, after an empty first line", '\nsql("a") b', 1, 6, true],
		["after, after an empty first line", '\nsql("a") b', 1, 9, false],
		["inside, on the third line", 'a\nb\nsql("x") + y', 2, 6, true],
		["after, on the third line", 'a\nb\nsql("x") + y', 2, 9, false],
		["past the last line", 'x\nsql("ab', 4, 0, true],
		["past the last line of a closed literal", 'sql("a") + b', 3, 0, false],
		["at the start", 'sql("a") + b', 0, 0, false],
	])("cursor %s", async (_, text, line, character, asked) => {
		const { s, provide } = await provider();
		await provide(text, line, character);
		expect(s.calls.length).toBe(asked ? 1 : 0);
	});

	test("disabled in the settings: no items, the server is not asked", async () => {
		state.config.set("typesql.completions.enable", false);
		const { s, provide } = await provider();
		s.reply = () => Promise.resolve(completions([item("users", "table")]));
		expect(await provide('sql("', 0, 5)).toBeUndefined();
		expect(s.calls).toEqual([]);
	});

	test("enabled in the settings", async () => {
		state.config.set("typesql.completions.enable", true);
		const { s, provide } = await provider();
		s.reply = () => Promise.resolve(completions([item("users", "table")]));
		expect(await provide('sql("', 0, 5)).toHaveLength(1);
	});

	test("before the server started: no items", async () => {
		await setup();
		const p = state.providers[0]!.provider;
		expect(
			await p.provideCompletionItems(doc("file:///project/a.ts", 'sql("'), {
				line: 0,
				character: 5,
			}),
		).toBeUndefined();
		expect(state.logs).toEqual([["info", LEGACY_INFO]]);
	});

	test("logs how many items and how long they took", async () => {
		const { s, provide } = await provider();
		const now = vi.spyOn(Date, "now");
		now.mockReturnValueOnce(1000).mockReturnValueOnce(1042);
		s.reply = () =>
			Promise.resolve(
				completions([item("users", "table"), item("id", "column")]),
			);
		await provide('sql("', 0, 5);
		expect(state.logs.at(-1)).toEqual(["trace", "2 items in 42 ms"]);
	});

	test("a failed request is logged and adds nothing", async () => {
		const { s, provide } = await provider();
		const error = new Error("boom");
		s.reply = () => Promise.reject(error);
		expect(await provide('sql("', 0, 5)).toBeUndefined();
		expect(state.logs.at(-1)).toEqual(["error", error]);
		expect(state.logs.at(-1)![1]).toBe(error);
		s.reply = () => Promise.reject(42);
		expect(await provide('sql("', 0, 5)).toBeUndefined();
		expect(state.logs.at(-1)).toEqual(["error", "42"]);
	});

	test("a request over 150 ms is logged and adds nothing", async () => {
		vi.useFakeTimers();
		const { s, provide } = await provider();
		s.reply = () => new Promise(() => {});
		const pending = provide('sql("', 0, 5);
		let done = false;
		void pending.then(() => (done = true));
		await vi.advanceTimersByTimeAsync(149);
		expect(done).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(await pending).toBeUndefined();
		expect(state.logs.at(-1)).toEqual([
			"warn",
			"completions took longer than 150 ms; skipped",
		]);
		expect(vi.getTimerCount()).toBe(0);
	});

	test("a request within 150 ms leaves no timer behind", async () => {
		vi.useFakeTimers();
		const { s, provide } = await provider();
		s.reply = () =>
			new Promise((resolve) =>
				setTimeout(() => resolve(completions([item("users", "table")])), 149),
			);
		const pending = provide('sql("', 0, 5);
		await vi.advanceTimersByTimeAsync(149);
		expect(await pending).toHaveLength(1);
		expect(vi.getTimerCount()).toBe(0);
		expect(state.logs.filter(([l]) => l === "warn")).toEqual([]);
	});
});
