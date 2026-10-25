/** The proxy's framing and routing, byte for byte, between a fake editor and a fake server. */
import { PassThrough } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { proxy } from "../src/proxy.js";

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
	while (list.length < n) await new Promise((r) => setTimeout(r, 1));
};

/** A proxy between a fake editor and a fake server whose API is `api`. */
function wire(api: unknown = {}) {
	const editor = { readable: new PassThrough(), writable: new PassThrough() };
	const server = { readable: new PassThrough(), writable: new PassThrough() };
	const log: string[] = [];
	proxy(
		editor,
		async () => ({
			...server,
			ts: { API: api as never, SyntaxKind: KINDS, dir: "/ts", version: "7.1" },
		}),
		(m) => {
			if (!m.startsWith("using @typesql/core")) log.push(m);
		},
		10_000,
	);
	const toEditor = frames(editor.writable);
	const toServer = frames(server.writable);
	const w = {
		log,
		editor,
		server,
		toEditor,
		toServer,
		fromEditor: (body: string) => editor.readable.write(frame(body)),
		fromServer: (body: string) => server.readable.write(frame(body)),
		async initialize() {
			w.fromEditor(
				'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{}}}',
			);
			await until(toServer, 1);
			w.fromServer('{"jsonrpc":"2.0","id":1,"result":{"capabilities":{}}}');
			await until(toEditor, 1);
		},
		/** The editor's completion request `id` at the end of `TEXT` in an open document. */
		async complete(id: number) {
			w.fromEditor(
				JSON.stringify({
					jsonrpc: "2.0",
					method: "textDocument/didOpen",
					params: { textDocument: { uri: URI, text: TEXT } },
				}),
			);
			const n = toServer.length;
			w.fromEditor(
				JSON.stringify({
					jsonrpc: "2.0",
					id,
					method: "textDocument/completion",
					params: {
						textDocument: { uri: URI },
						position: { line: 0, character: TEXT.length },
					},
				}),
			);
			await until(toServer, n + 2);
		},
	};
	return w;
}

test("our own requests: ids typesql:1, …; a second response to one goes to the editor", async () => {
	const w = wire({ fromLSPConnection: () => Promise.reject("refused") });
	await w.initialize();
	await w.complete(2);
	w.fromServer('{"jsonrpc":"2.0","id":2,"result":[]}');
	await until(w.toServer, 4);
	expect(JSON.parse(w.toServer[3]!.split("\r\n\r\n")[1]!)).toEqual({
		jsonrpc: "2.0",
		id: "typesql:1",
		method: "custom/initializeAPISession",
		params: {},
	});
	const again = '{"result":{"pipe":"p"},"id":"typesql:1","jsonrpc":"2.0"}';
	w.fromServer('{"jsonrpc":"2.0","id":"typesql:1","result":{"pipe":"p"}}');
	w.fromServer(again);
	await until(w.toEditor, 3);
	expect(w.toEditor.slice(1).sort()).toEqual(
		[frame(again), frame('{"jsonrpc":"2.0","id":2,"result":[]}')].sort(),
	);
	expect(w.log).toEqual(["refused"]);
});

test("a completion response is answered once; the server's requests pass through as they are", async () => {
	const w = wire();
	await w.initialize();
	w.fromEditor(
		JSON.stringify({
			jsonrpc: "2.0",
			id: 2,
			method: "textDocument/completion",
			params: {
				textDocument: { uri: "file:///unknown.ts" },
				position: { line: 0, character: 0 },
			},
		}),
	);
	await until(w.toServer, 2);
	// a request of the server with the same id, and the response (in another key order than ours)
	const request =
		'{"method":"workspace/configuration","id":2,"params":{"items":[]},"jsonrpc":"2.0"}';
	const response = '{"result":["first"],"id":2,"jsonrpc":"2.0"}';
	const again = '{"result":["again"],"id":2,"jsonrpc":"2.0"}';
	w.fromServer(request);
	w.fromServer(response);
	await until(w.toEditor, 3);
	w.fromServer(again);
	await until(w.toEditor, 4);
	expect(w.toEditor.slice(1)).toEqual([
		frame(request),
		frame('{"jsonrpc":"2.0","result":["first"],"id":2}'),
		frame(again),
	]);
});

test("a completion notification (no id) waits for nothing", async () => {
	const w = wire();
	await w.initialize();
	w.fromEditor(
		JSON.stringify({
			jsonrpc: "2.0",
			method: "textDocument/completion",
			params: {
				textDocument: { uri: "file:///unknown.ts" },
				position: { line: 0, character: 0 },
			},
		}),
	);
	await until(w.toServer, 2);
	const odd = '{"result":null,"jsonrpc":"2.0"}';
	w.fromServer(odd);
	await until(w.toEditor, 2);
	expect(w.toEditor[1]).toBe(frame(odd));
});

test("frames split anywhere, or several in a chunk, arrive whole and once each", async () => {
	const w = wire();
	await w.initialize();
	const a = frame('{"jsonrpc":"2.0","method":"initialized","params":{"a":1}}');
	const b = frame('{"jsonrpc":"2.0","method":"$/b","params":{}}');
	// the header and the body in pieces
	w.editor.readable.write(a.slice(0, 10));
	w.editor.readable.write(a.slice(10, a.length - 3));
	w.editor.readable.write(a.slice(a.length - 3) + b);
	// whitespace after the colon is optional, and the name is case-insensitive
	const c = `content-length:32\r\n\r\n{"jsonrpc":"2.0","method":"$/c"}`;
	w.editor.readable.write(c);
	await until(w.toServer, 4);
	expect(w.toServer.slice(1)).toEqual([a, b, c]);
});

test("a frame without Content-Length is a protocol error", () => {
	expect(() =>
		wire().editor.readable.write("Content-Type: x\r\n\r\n{}"),
	).toThrow('no Content-Length in the header "Content-Type: x"');
	expect(() => wire().editor.readable.write("\r\n\r\n{}")).toThrow(
		'no Content-Length in the header ""',
	);
});

test("the editor ends before the server runs, or one that did not start: nothing to close", async () => {
	const errors: unknown[] = [];
	const onError = (e: unknown): void => {
		errors.push(e);
	};
	process.on("unhandledRejection", onError);
	process.on("uncaughtException", onError);
	try {
		wire().editor.readable.end();
		const failed = { readable: new PassThrough(), writable: new PassThrough() };
		proxy(
			failed,
			() => Promise.reject(new Error("no typescript here")),
			() => {},
		);
		failed.readable.write(
			frame('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'),
		);
		await until(frames(failed.writable), 1);
		failed.readable.end();
		await new Promise((r) => setTimeout(r, 50));
	} finally {
		process.off("unhandledRejection", onError);
		process.off("uncaughtException", onError);
	}
	expect(errors).toEqual([]);
});
