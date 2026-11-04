// Checks the Playground's application with tsrs, TypeScript 7.1 compiled to WebAssembly. A worker
// runs it because the checker recurses deeply and blocks while it runs.
import {
	type Diagnostic,
	makeRequest,
	memoryFileSystem,
	parseReply,
	runTscAsync,
	type WasmModule,
} from "@tsrs/wasm/core";
import type {
	CheckMessage,
	FromWorker,
	PlaygroundDiagnostic,
	ToWorker,
} from "./protocol.ts";

function reply(message: FromWorker): void {
	postMessage(message);
}

const app = "/app.ts";
const config = JSON.stringify({
	compilerOptions: {
		strict: true,
		target: "esnext",
		module: "nodenext",
		moduleResolution: "nodenext",
		declaration: true,
		emitDeclarationOnly: true,
		skipLibCheck: true,
		noErrorTruncation: true,
		outDir: "/out",
		types: [],
	},
	files: [app],
});

let compiled: Promise<WasmModule> | undefined;
let library: Record<string, string> = {};

async function compile(url: string): Promise<WasmModule> {
	const response = await fetch(url);
	if (!response.ok)
		throw new Error(`Fetching the compiler failed with ${response.status}`);
	return (response.headers.get("content-type") ?? "").startsWith(
		"application/wasm",
	)
		? WebAssembly.compileStreaming(response)
		: WebAssembly.compile(await response.arrayBuffer());
}

function message(d: Diagnostic, depth = 0): string {
	const lines = [`${"  ".repeat(depth)}${d.text}`];
	for (const next of d.messageChain ?? []) lines.push(message(next, depth + 1));
	return lines.join("\n");
}

function convert(d: Diagnostic): PlaygroundDiagnostic {
	const severity =
		d.category === 1 ? "error" : d.category === 0 ? "warning" : "info";
	const result: PlaygroundDiagnostic = {
		code: d.code,
		severity,
		message: message(d),
	};
	if (d.fileName === app) {
		result.from = d.pos;
		result.to = Math.max(d.end, d.pos);
		if (d.startPosition) {
			result.line = d.startPosition.line + 1;
			result.column = d.startPosition.character + 1;
		}
	} else if (d.fileName) {
		result.file = d.fileName.replace(/^\/node_modules\//, "");
	}
	return result;
}

async function check({ id, code }: CheckMessage): Promise<FromWorker> {
	if (!compiled) throw new Error("The checker was not initialized");
	const module = await compiled;
	const memory = memoryFileSystem({
		...library,
		// An ES module, as applications using TypeSQL are: imports need no `resolution-mode`.
		"/package.json": '{ "type": "module" }',
		"/tsconfig.json": config,
		[app]: code,
	});
	const decoder = new TextDecoder();
	let stderr = "";
	const started = performance.now();
	const result = await runTscAsync(
		module,
		makeRequest(["-p", "/tsconfig.json"], { cwd: "/", json: true }),
		memory,
		{ stderr: (chunk) => (stderr += decoder.decode(chunk, { stream: true })) },
	);
	const milliseconds = performance.now() - started;
	// 0: no errors, 1/2: diagnostics reported. Anything else means the compiler did not finish.
	if (result.exitCode > 2)
		return {
			type: "failure",
			id,
			message: stderr.trim() || `The compiler exited with ${result.exitCode}`,
		};
	return {
		type: "result",
		id,
		diagnostics: parseReply(result.reply).map(convert),
		declarations: memory.written.get("/out/app.d.ts") ?? "",
		milliseconds,
	};
}

addEventListener("message", async (event: MessageEvent<ToWorker>) => {
	const data = event.data;
	if (data.type === "init") {
		library = data.files;
		compiled = compile(data.wasmUrl);
		return;
	}
	try {
		reply(await check(data));
	} catch (error) {
		reply({ type: "failure", id: data.id, message: String(error) });
	}
});
