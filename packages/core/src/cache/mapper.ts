/// <reference types="node" />
/**
 * TypeScript 7.1 content mapper for `.typesqlcache` files, started by TypeScript (the language
 * server, or `tsc --runExternalCode`) for projects whose tsconfig lists it:
 *
 *   "contentMappers": [{ "package": "@typesql/core", "extensions": [".typesqlcache"] }]
 *
 * `transform` turns the file's JSON into the module augmentation the checker reads
 * (format.ts `render`). For each project it also runs the job (job.ts) that keeps the file up
 * to date, unless `CI` is set or `TYPESQL_CACHE=off`. The job starts a moment after the project
 * opens, so a short `tsc` run, which closes the project as soon as it has checked it, does not
 * start one. Set `TYPESQL_CACHE_LOG=<file>` to log what it does.
 */
import { appendFileSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fileId, parseCache, render } from "./format.js";
import { Job } from "./job.js";
import { InvalidParams, RpcError, serve, type Handlers } from "./rpc.js";

const here = dirname(fileURLToPath(import.meta.url));
/** The package root (dist/cache/ or src/cache/ → the directory with package.json). */
const root = join(here, "..", "..");
const isCorePath = (path: string): boolean => path.startsWith(join(root, "dist") + sep) || path.startsWith(join(root, "src") + sep);

/** `CacheVersion` of this copy of `@typesql/core` (of the build this file is part of). */
export function engineVersion(): string {
  const file = here.endsWith(join("dist", "cache")) ? join(root, "dist/engine/cache.d.ts") : join(root, "src/engine/cache.ts");
  try {
    return /export type CacheVersion = "([^"]*)"/.exec(readFileSync(file, "utf8"))?.[1] ?? "unknown";
  } catch {
    return "unknown";
  }
}

export interface MapperOptions {
  /** Start a job per project (off under `CI` or with `TYPESQL_CACHE=off`). */
  readonly generation: boolean;
  /** Milliseconds between a project's first transform and its job's start. */
  readonly startDelayMs: number;
  readonly engine: string;
  readonly log: (message: string) => void;
}

interface ProjectState {
  readonly configFile: string;
  /** Cache files of the project seen in `transform`; the job writes the first by path. */
  readonly files: Set<string>;
  job?: Job;
  timer?: NodeJS.Timeout;
}

const object = (v: unknown, what: string): Record<string, unknown> => {
  if (typeof v !== "object" || v === null) throw new RpcError(InvalidParams, `${what}: expected an object`);
  return v as Record<string, unknown>;
};

/** The protocol handlers, and `stop()` for the jobs they started. */
export function createMapper(o: MapperOptions): { handlers: Handlers; stop: () => Promise<void> } {
  const projects = new Map<string, ProjectState>();
  const startJob = (handle: string): void => {
    const p = projects.get(handle);
    if (!p || p.job || !o.generation || !p.configFile) return;
    const cacheFile = [...p.files].sort()[0];
    if (!cacheFile) return;
    o.log(`job for ${p.configFile} → ${cacheFile}`);
    p.job = new Job({ configFile: p.configFile, cacheFile, engine: o.engine, isCorePath, log: o.log });
    p.job.start();
  };
  const handlers: Handlers = {
    initialize(params) {
      const encodings = object(params, "initialize").positionEncodings;
      if (!Array.isArray(encodings) || !encodings.length) throw new RpcError(InvalidParams, "initialize: no positionEncodings");
      o.log(`initialize (engine ${o.engine}, generation ${o.generation ? "on" : "off"})`);
      // the virtual file has no mappings, so the encoding does not matter
      return { positionEncoding: encodings.includes("utf-16") ? "utf-16" : encodings[0], diagnosticSource: "typesql" };
    },
    openProject(params) {
      const p = object(params, "openProject");
      projects.set(String(p.projectHandle), { configFile: String(p.configFileName ?? ""), files: new Set() });
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
        if (o.generation && !project.job && !project.timer) project.timer = setTimeout(() => startJob(handle), o.startDelayMs);
      }
      const text = render(parseCache(String(p.content ?? "")), fileId(fileName), o.engine);
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

/** Run as the content mapper process (TypeScript starts `node dist/cache/mapper.js`). */
export async function main(): Promise<void> {
  const logFile = process.env.TYPESQL_CACHE_LOG;
  const { handlers, stop } = createMapper({
    generation: !process.env.CI && process.env.TYPESQL_CACHE !== "off",
    startDelayMs: Number(process.env.TYPESQL_CACHE_DELAY ?? 1500),
    engine: engineVersion(),
    log: (m) => {
      if (logFile) appendFileSync(logFile, `${new Date().toISOString()} [${process.pid}] ${m}\n`);
    },
  });
  await serve(handlers, process.stdin, process.stdout);
  await stop();
  process.exit(0);
}

const invoked = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : "";
if (import.meta.url === invoked) void main();
