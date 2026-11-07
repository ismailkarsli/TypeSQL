import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Session, typescriptModulesFrom } from "@typesql/language-server";

// The editor's side: a TypeScript 7.1 language server with the file open.
const root = dirname(import.meta.dirname);
const file = join(root, "queries.ts");
const uri = pathToFileURL(file).href;
const tsc = createRequire(file).resolve("typescript/package.json");
const server = spawn(join(dirname(tsc), "bin", "tsc"), ["--lsp", "--stdio"], {
	cwd: root,
	stdio: ["pipe", "pipe", "ignore"],
});
interface Params {
	readonly processId?: number;
	readonly rootUri?: string;
	readonly capabilities?: {};
	readonly textDocument?: {
		readonly uri: string;
		readonly languageId: string;
		readonly version: number;
		readonly text: string;
	};
}
interface Outgoing {
	readonly id?: number;
	readonly method?: string;
	readonly params?: Params;
	readonly result?: null;
}
const send = (message: Outgoing) => {
	const body = JSON.stringify({ jsonrpc: "2.0", ...message });
	server.stdin.write(
		`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
	);
};
const waiting = new Map<number, (result: { pipe?: string }) => void>();
let received = Buffer.alloc(0);
server.stdout.on("data", (data: Buffer) => {
	received = Buffer.concat([received, data]);
	for (;;) {
		const end = received.indexOf("\r\n\r\n");
		if (end < 0) return;
		const length = Number(
			/Content-Length: (\d+)/.exec(received.subarray(0, end).toString())?.[1],
		);
		if (received.length < end + 4 + length) return;
		const message = JSON.parse(
			received.subarray(end + 4, end + 4 + length).toString(),
		);
		received = received.subarray(end + 4 + length);
		if (message.method !== undefined) {
			// Requests from the server: answered with no result.
			if (message.id !== undefined) send({ id: message.id, result: null });
		} else waiting.get(message.id)?.(message.result);
	}
});
let nextId = 0;
const request = (method: string, params: Params) =>
	new Promise<{ pipe?: string }>((resolve) => {
		const id = ++nextId;
		waiting.set(id, resolve);
		send({ id, method, params });
	});

await request("initialize", {
	processId: process.pid,
	rootUri: pathToFileURL(root).href,
	capabilities: {},
});
send({ method: "initialized", params: {} });
const source = readFileSync(file, "utf8");
send({
	method: "textDocument/didOpen",
	params: {
		textDocument: { uri, languageId: "typescript", version: 1, text: source },
	},
});
const { pipe } = await request("custom/initializeAPISession", {});

const session = new Session(
	{
		pipe: async () => pipe ?? "",
		modules: (fileName) => [() => typescriptModulesFrom(fileName)],
	},
	() => {},
);

/** The completions at the `|` of `statement`, in a `sql()` call of the file. */
const completions = async (statement: string) => {
	const start = source.indexOf('"SELECT id FROM users"') + 1;
	const before =
		source.slice(0, start) + statement.slice(0, statement.indexOf("|"));
	const text = `${before}${statement.slice(statement.indexOf("|") + 1)}");\n`;
	const lines = before.split("\n");
	const position = { line: lines.length - 1, character: lines.at(-1)!.length };
	// The first requests can go over the budget while the program loads.
	for (let attempt = 0; attempt < 40; attempt++) {
		const result = await session.complete(uri, position, text);
		if (result) return result.items.map((item) => item.label).sort();
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return null;
};

try {
	console.log(
		"one statement:",
		await completions("SELECT lower(|) FROM users"),
	);
	// A statement cut off while typing leaves nothing for the next one to read.
	console.log(
		"after a cut-off WITH:",
		await completions("WITH a; SELECT lower(|) FROM users"),
	);
	console.log(
		"after a cut-off INSERT:",
		await completions("INSERT INTO ; SELECT * FROM users WHERE |"),
	);
} finally {
	await session.close();
	server.kill();
}
