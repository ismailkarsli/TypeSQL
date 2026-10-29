import { appendFileSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CacheDialect } from "./dialect.js";
import { DIALECTS, dialectNamed } from "./dialects.js";
import { fileId, parseCache, render } from "./format.js";
import { Job } from "./job.js";
import { type Handlers, InvalidParams, RpcError, serve } from "./rpc.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const isCorePath = (path: string): boolean =>
	path.startsWith(join(root, "dist") + sep) ||
	path.startsWith(join(root, "src") + sep);

export function engineVersion(dialect: CacheDialect): string {
	const file = here.endsWith(join("dist", "cache"))
		? join(root, "dist", `${dialect.versionFile}.d.ts`)
		: join(root, "src", `${dialect.versionFile}.ts`);
	try {
		return (
			/export type CacheVersion = "([^"]*)"/.exec(
				readFileSync(file, "utf8"),
			)?.[1] ?? "unknown"
		);
	} catch {
		return "unknown";
	}
}

export interface MapperOptions {
	readonly generation: boolean;
	readonly startDelayMs: number;
	readonly engine: (dialect: CacheDialect) => string;
	readonly log: (message: string) => void;
}

interface ProjectState {
	readonly configFile: string;
	readonly files: Set<string>;
	dialect?: CacheDialect;
	job?: Job;
	timer?: NodeJS.Timeout;
}

const object = (v: unknown, what: string): Record<string, unknown> => {
	if (typeof v !== "object" || v === null)
		throw new RpcError(InvalidParams, `${what}: expected an object`);
	return v as Record<string, unknown>;
};

export function createMapper(o: MapperOptions): {
	handlers: Handlers;
	stop: () => Promise<void>;
} {
	const projects = new Map<string, ProjectState>();
	const startJob = (handle: string): void => {
		const p = projects.get(handle);
		if (!p || p.job || !o.generation || !p.configFile) return;
		const cacheFile = [...p.files].sort()[0];
		if (!cacheFile) return;
		const dialect = p.dialect ?? dialectNamed(undefined);
		o.log(
			`job for ${p.configFile} → ${cacheFile} (${p.dialect ? dialect.name : "dialect from the project"})`,
		);
		p.job = new Job({
			configFile: p.configFile,
			cacheFile,
			dialect,
			engine: o.engine(dialect),
			...(p.dialect
				? {}
				: { detect: { dialects: DIALECTS, engine: o.engine } }),
			isCorePath,
			log: o.log,
		});
		p.job.start();
	};
	const handlers: Handlers = {
		initialize(params) {
			const encodings = object(params, "initialize").positionEncodings;
			if (!Array.isArray(encodings) || !encodings.length)
				throw new RpcError(InvalidParams, "initialize: no positionEncodings");
			o.log(`initialize (generation ${o.generation ? "on" : "off"})`);
			return {
				positionEncoding: encodings.includes("utf-16")
					? "utf-16"
					: encodings[0],
				diagnosticSource: "typesql",
			};
		},
		openProject(params) {
			const p = object(params, "openProject");
			projects.set(String(p.projectHandle), {
				configFile: String(p.configFileName ?? ""),
				files: new Set(),
			});
			o.log(`openProject ${p.configFileName}`);
			return {};
		},
		transform(params) {
			const p = object(params, "transform");
			const fileName = String(p.fileName);
			const handle = String(p.projectHandle);
			const project = projects.get(handle);
			if (project && !project.files.has(fileName)) {
				project.files.add(fileName);
				if (o.generation && !project.job && !project.timer)
					project.timer = setTimeout(() => startJob(handle), o.startDelayMs);
			}
			const file = parseCache(String(p.content ?? ""));
			const dialect = dialectNamed(file?.dialect);
			if (project && file) project.dialect ??= dialect;
			const text = render(file, fileId(fileName), dialect, o.engine(dialect));
			o.log(`transform ${fileName} (${text.length} characters)`);
			return { text, extension: ".ts" };
		},
		async closeProject(params) {
			const handle = String(object(params, "closeProject").projectHandle);
			const p = projects.get(handle);
			projects.delete(handle);
			if (p) {
				clearTimeout(p.timer);
				await p.job?.stop();
			}
			o.log(`closeProject ${p?.configFile}`);
			return null;
		},
	};
	const stop = async (): Promise<void> => {
		for (const p of projects.values()) clearTimeout(p.timer);
		await Promise.all([...projects.values()].map((p) => p.job?.stop()));
	};
	return { handlers, stop };
}

export async function main(): Promise<void> {
	const logFile = process.env.TYPESQL_CACHE_LOG;
	const versions = new Map<CacheDialect, string>();
	const { handlers, stop } = createMapper({
		generation: !process.env.CI && process.env.TYPESQL_CACHE !== "off",
		startDelayMs: Number(process.env.TYPESQL_CACHE_DELAY ?? 1500),
		engine: (d) => {
			let v = versions.get(d);
			if (v === undefined) {
				v = engineVersion(d);
				versions.set(d, v);
			}
			return v;
		},
		log: (m) => {
			if (logFile)
				appendFileSync(
					logFile,
					`${new Date().toISOString()} [${process.pid}] ${m}\n`,
				);
		},
	});
	await serve(handlers, process.stdin, process.stdout);
	await stop();
	process.exit(0);
}

const invoked = process.argv[1]
	? pathToFileURL(realpathSync(process.argv[1])).href
	: "";
if (import.meta.url === invoked) void main();
