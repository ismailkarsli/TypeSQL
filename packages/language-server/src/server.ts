/**
 * A completion server for editors that hook into a running TypeScript 7.1 language server, such
 * as Neovim: connects to its API session (session.ts) at `pipe` and adds TypeSQL's items to its
 * completion responses inside statement literals.
 *
 * `start(pipe)` runs it on stdin and stdout. `serve` is the part without a process.
 */
import type { Readable, Writable } from "node:stream";
import { mayBeInSqlLiteral } from "./literal.js";
import { merge } from "./merge.js";
import {
	type Connector,
	type Position,
	Session,
	typescriptModules,
} from "./session.js";

/** Milliseconds our items may add to a completion response; later ones add nothing. */
const BUDGET_MS = 150;

/** A peer's end of a connection: what it sends, and where to send it messages. */
export interface Peer {
	readonly readable: Readable;
	readonly writable: Writable;
}

type Result = Parameters<typeof merge>[0];

interface CompletionParams {
	readonly uri: string;
	readonly position: Position;
	readonly text: string;
	readonly result: Result;
}

interface Message {
	readonly id?: number | string;
	readonly params: CompletionParams;
}

/** Serves completion requests on stdin and stdout, reading the program at `pipe`. */
export function start(pipe: string): void {
	serve(
		{ readable: process.stdin, writable: process.stdout },
		{
			pipe: async () => pipe,
			modules: (fileName) => [() => typescriptModules(fileName)],
		},
		(m) => process.stderr.write(`typesql: ${m}\n`),
	);
}

/**
 * Answers `client`'s completion requests with `result` merged with our items from `connector`,
 * within `budget` milliseconds.
 */
export function serve(
	client: Peer,
	connector: Connector,
	log: (message: string) => void,
	budget = BUDGET_MS,
): void {
	const session = new Session(connector, log);
	const answer = async ({
		uri,
		position,
		text,
		result,
	}: CompletionParams): Promise<Result> => {
		if (!mayBeInSqlLiteral(text, offsetOf(text, position))) return result;
		try {
			const started = Date.now();
			const ours = await withBudget(
				session.complete(uri, position, text),
				budget,
			);
			if (ours === "late") {
				log(`completions took longer than ${budget} ms; skipped`);
				return result;
			}
			if (ours) log(`${ours.items.length} items in ${Date.now() - started} ms`);
			return merge(result, ours);
		} catch (e) {
			log(e instanceof Error ? (e.stack ?? e.message) : String(e));
			return result;
		}
	};
	read(client.readable, (m) => {
		const id = m.id;
		if (id === undefined) return;
		void answer(m.params).then((result) =>
			client.writable.write(frame({ id, result })),
		);
	});
	client.readable.on("end", () => {
		void session.close();
	});
}

/** Calls `onMessage` with each message on `stream`. */
function read(stream: Readable, onMessage: (m: Message) => void): void {
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
			const body = buffer.subarray(end + 4, size).toString();
			buffer = buffer.subarray(size);
			onMessage(JSON.parse(body) as Message);
		}
	});
}

function frame(m: {
	readonly id: number | string;
	readonly result: Result;
}): Buffer {
	const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...m }));
	return Buffer.concat([
		Buffer.from(`Content-Length: ${body.length}\r\n\r\n`),
		body,
	]);
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
