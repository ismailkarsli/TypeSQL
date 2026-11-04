import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { type DmmfDatamodel, isDmmfDatamodel } from "./dmmf.js";

interface GeneratorManifest {
	readonly prettyName?: string;
	readonly defaultOutput?: string;
	readonly requiresEngines?: readonly string[];
	readonly version?: string;
}

interface GeneratorConfig {
	readonly name: string;
	readonly output: { readonly value: string | null } | null;
	readonly config: Readonly<
		Record<string, string | readonly string[] | undefined>
	>;
}

interface Datasource {
	readonly provider: string;
	readonly activeProvider?: string;
}

/** The parts of Prisma's generator options that typesql reads. */
export interface GeneratorOptions {
	readonly generator: GeneratorConfig;
	readonly datamodel: string;
	readonly dmmf: { readonly datamodel: DmmfDatamodel };
	readonly datasources: readonly Datasource[];
}

export interface GeneratorHandler {
	onManifest(
		config: GeneratorConfig,
	): GeneratorManifest | Promise<GeneratorManifest>;
	onGenerate(options: GeneratorOptions): void | Promise<void>;
}

interface Request {
	readonly id?: unknown;
	readonly method: string;
	readonly params?: unknown;
}

interface Reply {
	readonly jsonrpc: "2.0";
	readonly id: unknown;
}

type Response = Reply &
	(
		| { readonly result: { readonly manifest: GeneratorManifest } | null }
		| {
				readonly error: {
					readonly code: number;
					readonly message: string;
					readonly data?: { readonly stack: string | undefined };
				};
		  }
	);

const isObject = (value: unknown): value is object =>
	typeof value === "object" && value !== null;

const isRequest = (value: unknown): value is Request =>
	isObject(value) && "method" in value && typeof value.method === "string";

const isGeneratorConfig = (value: unknown): value is GeneratorConfig =>
	isObject(value) &&
	"name" in value &&
	typeof value.name === "string" &&
	"output" in value &&
	(value.output === null ||
		(isObject(value.output) &&
			"value" in value.output &&
			(value.output.value === null ||
				typeof value.output.value === "string"))) &&
	"config" in value &&
	isObject(value.config) &&
	Object.values(value.config).every(
		(option) =>
			option === undefined ||
			typeof option === "string" ||
			(Array.isArray(option) && option.every((s) => typeof s === "string")),
	);

const isDatasource = (value: unknown): value is Datasource =>
	isObject(value) &&
	"provider" in value &&
	typeof value.provider === "string" &&
	(!("activeProvider" in value) ||
		value.activeProvider === undefined ||
		typeof value.activeProvider === "string");

const isGeneratorOptions = (value: unknown): value is GeneratorOptions =>
	isObject(value) &&
	"generator" in value &&
	isGeneratorConfig(value.generator) &&
	"datamodel" in value &&
	typeof value.datamodel === "string" &&
	"dmmf" in value &&
	isObject(value.dmmf) &&
	"datamodel" in value.dmmf &&
	isDmmfDatamodel(value.dmmf.datamodel) &&
	"datasources" in value &&
	Array.isArray(value.datasources) &&
	value.datasources.every(isDatasource);

const METHOD_NOT_FOUND = -32601;
const SERVER_ERROR = -32000;

async function respond(
	handler: GeneratorHandler,
	req: Request,
): Promise<Response> {
	const reply: Reply = { jsonrpc: "2.0", id: req.id };
	try {
		switch (req.method) {
			case "getManifest":
				if (!isGeneratorConfig(req.params))
					throw new Error("typesql-prisma: invalid generator config");
				return {
					...reply,
					result: { manifest: await handler.onManifest(req.params) },
				};
			case "generate":
				if (!isGeneratorOptions(req.params))
					throw new Error("typesql-prisma: invalid generator options");
				await handler.onGenerate(req.params);
				return { ...reply, result: null };
			default:
				return {
					...reply,
					error: {
						code: METHOD_NOT_FOUND,
						message: `Method not found: ${req.method}`,
					},
				};
		}
	} catch (err) {
		const e = err instanceof Error ? err : new Error(String(err));
		return {
			...reply,
			error: {
				code: SERVER_ERROR,
				message: e.message,
				data: { stack: e.stack },
			},
		};
	}
}

export function serveGenerator(
	handler: GeneratorHandler,
	input: Readable = process.stdin,
	output: Writable = process.stderr,
): Promise<void> {
	const pending: Promise<void>[] = [];
	const lines = createInterface({ input, crlfDelay: Infinity });
	lines.on("line", (line) => {
		if (line.trim() === "") return;
		let req: unknown;
		try {
			req = JSON.parse(line);
		} catch {
			output.write(
				`typesql-prisma: ignoring a request that is not JSON: ${line}\n`,
			);
			return;
		}
		if (!isRequest(req)) {
			output.write(
				`typesql-prisma: ignoring a request without a method: ${line}\n`,
			);
			return;
		}
		pending.push(
			respond(handler, req).then(
				(res) => void output.write(`${JSON.stringify(res)}\n`),
			),
		);
	});
	return new Promise((resolve) =>
		lines.on("close", () => void Promise.all(pending).then(() => resolve())),
	);
}
