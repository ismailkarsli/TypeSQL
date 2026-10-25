/**
 * A language server for editors whose extensions can't reach TypeScript's language server, such
 * as Zed and Neovim: a proxy in front of the project's `tsc --lsp --stdio` (TypeScript 7.1). It
 * passes every message through and adds TypeSQL's items to completion responses inside statement
 * literals, through an API session (session.ts) on that same server.
 *
 * `start()` runs it on stdin and stdout. `proxy` is the part without a process.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Range } from "typescript/vscode";
import { mayBeInSqlLiteral } from "./literal.js";
import { merge } from "./merge.js";
import {
	Session,
	type TypeScriptModules,
	typescriptModules,
} from "./session.js";

/** Milliseconds our items may add to a completion response; later ones add nothing. */
const BUDGET_MS = 150;

/** A peer's end of a connection: what it sends, and where to send it messages. */
export interface Peer {
	readonly readable: Readable;
	readonly writable: Writable;
}

/** TypeScript's language server, and the API package of the same installation. */
export interface Server extends Peer {
	readonly ts: TypeScriptModules;
}

/** Starts `tsc --lsp --stdio` of the `typescript` package resolved from `root` (a directory). */
export async function spawnTypeScript(
	root: string,
): Promise<{ server: Server; child: ChildProcess }> {
	const from = join(root, "package.json");
	const ts = await typescriptModules(from);
	const pkg = createRequire(from).resolve("typescript/package.json");
	const getExePath = (
		(await import(
			pathToFileURL(join(dirname(pkg), "lib/getExePath.js")).href
		)) as { default: () => string }
	).default;
	const child = spawn(getExePath(), ["--lsp", "--stdio"], {
		cwd: root,
		stdio: ["pipe", "pipe", "inherit"],
	});
	return {
		server: { readable: child.stdout, writable: child.stdin, ts },
		child,
	};
}

/**
 * Serves the proxy on stdin and stdout. TypeScript is started from `root`, or from the
 * workspace the editor's `initialize` request names.
 */
export function start(root?: string): void {
	proxy(
		{ readable: process.stdin, writable: process.stdout },
		async (dir) => {
			const { server, child } = await spawnTypeScript(dir);
			child.on("exit", (code) => process.exit(code ?? 0));
			return server;
		},
		(m) => process.stderr.write(`typesql: ${m}\n`),
		BUDGET_MS,
		root,
	);
}

type Id = number | string;

interface Message {
	readonly id?: Id;
	readonly method?: string;
	readonly params?: unknown;
	readonly result?: unknown;
	readonly error?: unknown;
}

interface Position {
	readonly line: number;
	readonly character: number;
}

interface CompletionParams {
	readonly textDocument: { readonly uri: string };
	readonly position: Position;
}

interface Change {
	readonly range?: Range;
	readonly text: string;
}

/** The parts of the editor's messages the proxy reads. */
interface ClientParams extends CompletionParams {
	readonly capabilities?: { general?: { positionEncodings?: unknown } };
	readonly workspaceFolders?: readonly { readonly uri: string }[] | null;
	readonly rootUri?: string | null;
	readonly rootPath?: string | null;
	readonly textDocument: { readonly uri: string; readonly text: string };
	readonly contentChanges: readonly Change[];
}

/**
 * Passes messages between `client` (the editor) and the server `startServer` starts for `root`
 * (default: the workspace of the editor's `initialize` request), and adds our items to the
 * server's completion responses within `budget` milliseconds.
 */
export function proxy(
	client: Peer,
	startServer: (root: string) => Promise<Server>,
	log: (message: string) => void,
	budget = BUDGET_MS,
	root?: string,
): void {
	/** The editor's text of open documents, for the cheap test before a lookup. */
	const texts = new Map<string, string>();
	/** The editor's completion requests the server has not answered yet. */
	const pending = new Map<Id, CompletionParams>();
	/** Our own requests to the server. */
	const own = new Map<Id, (m: Message) => void>();
	let next = 0;
	let server: Promise<Server | undefined> | undefined;
	let session: Session | undefined;
	/** Messages for the server, in order, once it runs. */
	let toServer = Promise.resolve();
	const send = (bytes: Buffer): void => {
		toServer = toServer.then(async () => {
			(await server)?.writable.write(bytes);
		});
	};

	const request = (method: string, params: unknown): Promise<Message> =>
		new Promise((resolve) => {
			const id = `typesql:${++next}`;
			own.set(id, resolve);
			send(frame({ id, method, params }));
		});

	const answer = async (
		session: Session,
		m: Message,
		{ textDocument: { uri }, position }: CompletionParams,
	): Promise<Message> => {
		const text = texts.get(uri);
		if (
			m.error ||
			text === undefined ||
			!mayBeInSqlLiteral(text, offsetOf(text, position))
		)
			return m;
		try {
			const started = Date.now();
			const ours = await withBudget(
				session.complete(uri, position, text),
				budget,
			);
			if (ours === "late") {
				log(`completions took longer than ${budget} ms; skipped`);
				return m;
			}
			if (ours) log(`${ours.items.length} items in ${Date.now() - started} ms`);
			return { ...m, result: merge(m.result as never, ours) };
		} catch (e) {
			log(e instanceof Error ? (e.stack ?? e.message) : String(e));
			return m;
		}
	};

	const serve = (s: Server): void => {
		const current = new Session(
			{
				pipe: async () => {
					const r = await request("custom/initializeAPISession", {});
					if (r.error) throw new Error(JSON.stringify(r.error));
					return (r.result as { pipe: string }).pipe;
				},
				modules: () => [async () => s.ts],
			},
			log,
		);
		session = current;
		read(s.readable, (m, raw) => {
			// a response: to one of our requests, or to the editor's completion request
			if (m.method === undefined) {
				const id = m.id as Id;
				const resolve = own.get(id);
				if (resolve) {
					own.delete(id);
					resolve(m);
					return;
				}
				const params = pending.get(id);
				if (params) {
					pending.delete(id);
					void answer(current, m, params).then((r) =>
						client.writable.write(frame(r)),
					);
					return;
				}
			}
			client.writable.write(raw);
		});
	};

	read(client.readable, (m, raw) => {
		const params = m.params as ClientParams;
		switch (m.method) {
			case "initialize": {
				const folder = params.workspaceFolders?.[0]?.uri ?? params.rootUri;
				const dir =
					root ??
					(folder ? fileURLToPath(folder) : (params.rootPath ?? process.cwd()));
				server = startServer(dir).then(
					(s) => {
						serve(s);
						return s;
					},
					(e: unknown) => {
						const message = `cannot start TypeScript's language server from ${dir}: ${e instanceof Error ? e.message : String(e)}`;
						log(message);
						client.writable.write(
							frame({ id: m.id as Id, error: { code: -32603, message } }),
						);
						return undefined;
					},
				);
				// UTF-16 positions, as the API and our offsets count them
				const general = params.capabilities?.general;
				if (general?.positionEncodings) {
					delete general.positionEncodings;
					send(frame(m));
					return;
				}
				break;
			}
			case "textDocument/didOpen":
				texts.set(params.textDocument.uri, params.textDocument.text);
				break;
			case "textDocument/didChange": {
				const text = texts.get(params.textDocument.uri);
				if (text !== undefined)
					texts.set(
						params.textDocument.uri,
						applyChanges(text, params.contentChanges),
					);
				break;
			}
			case "textDocument/didClose":
				texts.delete(params.textDocument.uri);
				break;
			case "textDocument/completion":
				if (m.id !== undefined) pending.set(m.id, params);
				break;
		}
		send(raw);
	});
	client.readable.on("end", () => {
		toServer = toServer.then(async () => {
			(await server)?.writable.end();
		});
		void session?.close();
	});
}

/** Calls `onMessage` with each message on `stream` and its bytes, header included. */
function read(
	stream: Readable,
	onMessage: (m: Message, raw: Buffer) => void,
): void {
	let buffer = Buffer.alloc(0);
	stream.on("data", (d: Buffer) => {
		buffer = Buffer.concat([buffer, d]);
		for (;;) {
			const end = buffer.indexOf("\r\n\r\n");
			if (end < 0) return;
			const header = buffer.subarray(0, end).toString();
			const length = /Content-Length: *(\d+)/i.exec(header)?.[1];
			if (length === undefined)
				throw new Error(
					`no Content-Length in the header ${JSON.stringify(header)}`,
				);
			const size = end + 4 + Number(length);
			if (buffer.length < size) return;
			const raw = buffer.subarray(0, size);
			buffer = buffer.subarray(size);
			onMessage(JSON.parse(raw.subarray(end + 4).toString()) as Message, raw);
		}
	});
}

function frame(m: Message): Buffer {
	const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...m }));
	return Buffer.concat([
		Buffer.from(`Content-Length: ${body.length}\r\n\r\n`),
		body,
	]);
}

function applyChanges(text: string, changes: readonly Change[]): string {
	for (const c of changes)
		text = c.range
			? text.slice(0, offsetOf(text, c.range.start)) +
				c.text +
				text.slice(offsetOf(text, c.range.end))
			: c.text;
	return text;
}

function offsetOf(text: string, p: Position): number {
	let offset = 0;
	for (let line = 0; line < p.line; line++) {
		const nl = text.indexOf("\n", offset);
		if (nl < 0) return text.length;
		offset = nl + 1;
	}
	return offset + p.character;
}

function withBudget<T>(p: Promise<T>, ms: number): Promise<T | "late"> {
	let timer: NodeJS.Timeout | undefined;
	const late = new Promise<"late">(
		(resolve) => (timer = setTimeout(() => resolve("late"), ms)),
	);
	return Promise.race([p, late]).finally(() => clearTimeout(timer));
}
