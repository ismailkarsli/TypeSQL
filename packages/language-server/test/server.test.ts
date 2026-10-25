/** `start(pipe)` and `serve()`: framing, budget, logging and session lifecycle. */
import { PassThrough } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import { serve, start } from "../src/server.js";

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

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

interface Item {
	label: string;
	detail?: string;
}

const itemsOf = (r: unknown): Item[] => {
	const v = r as Item[] | { items: Item[] } | null;
	return v === null ? [] : Array.isArray(v) ? v : v.items;
};

const frame = (body: string): string =>
	`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;

/** The frames written to `stream`, as strings. */
function frames(stream: PassThrough): string[] {
	const out: string[] = [];
	let buffer = "";
	stream.on("data", (d: Buffer) => {
		buffer += d.toString();
		for (;;) {
			const m = /^Content-Length: *(\d+)\r\n\r\n/i.exec(buffer);
			if (!m || buffer.length < m[0].length + Number(m[1])) return;
			out.push(buffer.slice(0, m[0].length + Number(m[1])));
			buffer = buffer.slice(m[0].length + Number(m[1]));
		}
	});
	return out;
}

const until = async (list: readonly unknown[], n: number): Promise<void> => {
	const deadline = performance.now() + 500;
	while (list.length < n) {
		if (performance.now() > deadline)
			throw new Error(`expected ${n} frame(s), got ${list.length}`);
		await new Promise((r) => setTimeout(r, 1));
	}
};

function fake(api: unknown, budget?: number) {
	const log: string[] = [];
	const editor = { readable: new PassThrough(), writable: new PassThrough() };
	const out = frames(editor.writable);
	let nextId = 0;
	serve(
		editor,
		{
			pipe: async () => "pipe",
			modules: () => [
				async () => ({
					API: api as never,
					SyntaxKind: KINDS,
					dir: "/ts",
					version: "7.1.0",
				}),
			],
		},
		(m) => {
			if (!m.startsWith("using @typesql/core")) log.push(m);
		},
		...(budget === undefined ? [] : [budget]),
	);
	return {
		log,
		editor,
		out,
		complete: async (
			text = TEXT,
			position = { line: 0, character: TEXT.length },
			uri = URI,
		) => {
			const id = ++nextId;
			const before = out.length;
			editor.readable.write(
				frame(
					JSON.stringify({
						jsonrpc: "2.0",
						id,
						params: { uri, position, text, result: ITEMS },
					}),
				),
			);
			await until(out, before + 1);
			const msg = JSON.parse(out[before]!.split("\r\n\r\n")[1]!) as {
				id: number;
				result: unknown;
			};
			expect(msg.id).toBe(id);
			return msg.result;
		},
	};
}

/** An API whose connection fails: counts how often the server asked for our items. */
function asking() {
	const counter = { asked: 0 };
	const api = {
		fromLSPConnection: async () => {
			counter.asked++;
			throw new Error("asked");
		},
	};
	return { counter, api };
}

test("start(pipe): serves on process.stdin and process.stdout, resolves typescriptModules, connects to pipe, logs to stderr", async () => {
	const stdin = new PassThrough();
	const stdout = new PassThrough();
	const stderrLogs: string[] = [];
	const stdinGet = vi
		.spyOn(process, "stdin", "get")
		.mockReturnValue(stdin as never);
	const stdoutGet = vi
		.spyOn(process, "stdout", "get")
		.mockReturnValue(stdout as never);
	vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
		stderrLogs.push(String(chunk));
		return true;
	});
	try {
		start("/tmp/typesql-nonexistent-pipe.sock");
	} finally {
		stdinGet.mockRestore();
		stdoutGet.mockRestore();
	}
	const out = frames(stdout);
	stdin.write(
		frame(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				params: {
					uri: URI,
					position: { line: 0, character: TEXT.length },
					text: TEXT,
					result: ITEMS,
				},
			}),
		),
	);
	await until(out, 1);
	expect(JSON.parse(out[0]!.split("\r\n\r\n")[1]!)).toEqual({
		jsonrpc: "2.0",
		id: 1,
		result: ITEMS,
	});
	expect(
		stderrLogs.some((l) => /^typesql: using @typesql\/core at .+\n$/.test(l)),
	).toBe(true);
	expect(
		stderrLogs.some(
			(l) =>
				l.startsWith("typesql: ") &&
				l.includes("/tmp/typesql-nonexistent-pipe.sock") &&
				l.endsWith("\n"),
		),
	).toBe(true);
	stdin.end();
});

test("outside a statement literal: returns the server's result without touching the session", async () => {
	const { counter, api } = asking();
	const f = fake(api);
	expect(
		await f.complete("const a = 1 + ", { line: 0, character: 14 }),
	).toEqual(ITEMS);
	expect(counter.asked).toBe(0);
	expect(f.log).toEqual([]);
});

test("the cursor's offset: past the last line is the end; a line starts after its newline", async () => {
	const { counter, api } = asking();
	const f = fake(api);
	expect(await f.complete(TEXT, { line: 3, character: 0 })).toEqual(ITEMS);
	expect(counter.asked).toBe(1);
	expect(
		await f.complete(`\n${TEXT}");\nconst x = 1;`, {
			line: 1,
			character: 5,
		}),
	).toEqual(ITEMS);
	expect(counter.asked).toBe(2);
	expect(
		await f.complete(`\n${TEXT}");\nconst x = 1;`, {
			line: 2,
			character: 0,
		}),
	).toEqual(ITEMS);
	expect(counter.asked).toBe(2);
});

test("no items of ours (not a core call): the server's result, nothing logged but the session", async () => {
	const snapshot = {
		getDefaultProjectForFile: async () => undefined,
		dispose: async () => {},
	};
	const f = fake({
		fromLSPConnection: async () => ({
			getCurrentLanguageServerSnapshot: async () => snapshot,
			close: async () => {},
		}),
	});
	expect(await f.complete()).toEqual(ITEMS);
	expect(f.log).toEqual(["API session open (client: typescript 7.1.0 at /ts)"]);
});

test("failing lookups add nothing and are logged", async () => {
	const refused = fake({
		fromLSPConnection: () => Promise.reject("refused"),
	});
	expect(await refused.complete()).toEqual(ITEMS);
	expect(refused.log).toEqual(["refused"]);

	const bare = new Error("bare");
	delete bare.stack;
	const stackless = fake({
		fromLSPConnection: () => Promise.reject(bare),
	});
	expect(await stackless.complete()).toEqual(ITEMS);
	expect(stackless.log).toEqual(["bare"]);

	const withStack = new Error("boom");
	withStack.stack = "Error: boom\n  at test";
	const stacked = fake({
		fromLSPConnection: () => Promise.reject(withStack),
	});
	expect(await stacked.complete()).toEqual(ITEMS);
	expect(stacked.log).toEqual(["Error: boom\n  at test"]);
});

test("the default 150 ms budget skips a late lookup, and the timer is cleared when in time", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	const late = fake({
		fromLSPConnection: () => new Promise(() => {}),
	});
	let done = false;
	late.editor.readable.write(
		frame(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				params: {
					uri: URI,
					position: { line: 0, character: TEXT.length },
					text: TEXT,
					result: ITEMS,
				},
			}),
		),
	);
	void Promise.resolve().then(() => {
		if (late.out.length > 0) done = true;
	});
	await vi.advanceTimersByTimeAsync(149);
	expect(done).toBe(false);
	expect(late.out).toHaveLength(0);
	await vi.advanceTimersByTimeAsync(1);
	expect(late.out).toHaveLength(1);
	expect(JSON.parse(late.out[0]!.split("\r\n\r\n")[1]!)).toEqual({
		jsonrpc: "2.0",
		id: 1,
		result: ITEMS,
	});
	expect(late.log).toEqual(["completions took longer than 150 ms; skipped"]);
	expect(vi.getTimerCount()).toBe(0);

	const { counter, api } = asking();
	const fast = fake(api);
	fast.editor.readable.write(
		frame(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 2,
				params: {
					uri: URI,
					position: { line: 0, character: TEXT.length },
					text: TEXT,
					result: ITEMS,
				},
			}),
		),
	);
	await vi.advanceTimersByTimeAsync(0);
	expect(fast.out).toHaveLength(1);
	expect(counter.asked).toBe(1);
	expect(vi.getTimerCount()).toBe(0);
});

test("logs the elapsed time of a completion lookup and merges our items", async () => {
	let now = 1000;
	const spy = vi.spyOn(Date, "now").mockImplementation(() => {
		const v = now;
		now += 42;
		return v;
	});
	try {
		const f = fake({});
		vi.spyOn(
			(await import("../src/session.js")).Session.prototype,
			"complete",
		).mockResolvedValueOnce({
			items: [
				{
					label: "users",
					kind: "table",
					detail: "table",
					sortText: "0",
					insertText: "users",
				},
			],
			replace: { start: 19, end: 19 },
			literal: { start: 5, end: 19 },
			replaceRange: {
				start: { line: 0, character: 19 },
				end: { line: 0, character: 19 },
			},
			literalRange: {
				start: { line: 0, character: 5 },
				end: { line: 0, character: 19 },
			},
		});
		const r = await f.complete();
		expect(itemsOf(r).map((i) => i.label)).toEqual(["fromServer", "users"]);
		expect(f.log).toEqual(["1 items in 42 ms"]);
	} finally {
		spy.mockRestore();
	}
});

test("framing: split frames, several in a chunk, notifications without id, and closing the session on end", async () => {
	let closed = 0;
	const snapshot = {
		getDefaultProjectForFile: async () => undefined,
		dispose: async () => {},
	};
	const f = fake({
		fromLSPConnection: async () => ({
			getCurrentLanguageServerSnapshot: async () => snapshot,
			close: async () => {
				closed++;
			},
		}),
	});
	const notify = frame(
		JSON.stringify({
			jsonrpc: "2.0",
			method: "textDocument/completion",
			params: {
				uri: URI,
				position: { line: 0, character: TEXT.length },
				text: TEXT,
				result: ITEMS,
			},
		}),
	);
	const req1 = frame(
		JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			params: {
				uri: URI,
				position: { line: 0, character: TEXT.length },
				text: TEXT,
				result: ITEMS,
			},
		}),
	);
	const body2 = JSON.stringify({
		jsonrpc: "2.0",
		id: 2,
		params: {
			uri: URI,
			position: { line: 0, character: 0 },
			text: "const x = 1;",
			result: null,
		},
	});
	// whitespace after the colon is optional, and the name is case-insensitive
	const req2 = `content-length:${Buffer.byteLength(body2)}\r\n\r\n${body2}`;

	f.editor.readable.write(notify.slice(0, 10));
	f.editor.readable.write(notify.slice(10) + req1.slice(0, 12));
	f.editor.readable.write(req1.slice(12, req1.length - 4));
	f.editor.readable.write(req1.slice(req1.length - 4) + req2);
	await until(f.out, 2);
	expect(f.out.sort()).toEqual(
		[
			frame('{"jsonrpc":"2.0","id":1,"result":[{"label":"fromServer"}]}'),
			frame('{"jsonrpc":"2.0","id":2,"result":null}'),
		].sort(),
	);

	f.editor.readable.end();
	await vi.waitFor(() => expect(closed).toBe(1));
});

test("a frame without Content-Length is a protocol error", () => {
	expect(() =>
		fake({}).editor.readable.write("Content-Type: x\r\n\r\n{}"),
	).toThrow('no Content-Length in the header "Content-Type: x"');
	expect(() => fake({}).editor.readable.write("\r\n\r\n{}")).toThrow(
		'no Content-Length in the header ""',
	);
});
