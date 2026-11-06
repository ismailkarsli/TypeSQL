import type { Readable, Writable } from "node:stream";
import type { Position } from "./literal.js";
import { merge } from "./merge.js";
import {
	type Connector,
	type Log,
	Session,
	typescriptModulesFrom,
} from "./session.js";

interface Peer {
	readonly readable: Readable;
	readonly writable: Writable;
}

type Result = Parameters<typeof merge>[0];

interface CompletionParams {
	readonly uri: string;
	readonly position: Position;
	readonly text: string;
	readonly result?: Result;
}

interface Message {
	readonly id?: number | string;
	readonly params: CompletionParams;
}

export function start(pipe: string): void {
	serve(
		{ readable: process.stdin, writable: process.stdout },
		{
			pipe: async () => pipe,
			modules: (fileName) => [() => typescriptModulesFrom(fileName)],
		},
		(m) => process.stderr.write(`typesql: ${m}\n`),
	);
}

function serve(client: Peer, connector: Connector, log: Log): void {
	const session = new Session(connector, log);
	read(client.readable, (m) => {
		const id = m.id;
		if (id === undefined) return;
		// Lua clients drop a nil `result`; a missing one is TypeScript's null.
		const { uri, position, text, result = null } = m.params;
		void session
			.complete(uri, position, text)
			.then((ours) =>
				client.writable.write(frame({ id, result: merge(result, ours) })),
			);
	});
	client.readable.on("end", () => {
		void session.close();
	});
}

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
			const message: Message = JSON.parse(body);
			onMessage(message);
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
