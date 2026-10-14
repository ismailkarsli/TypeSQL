import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

/**
 * Prisma's generator protocol (as implemented by the Prisma 7 CLI): Prisma spawns the
 * `provider` command and writes one JSON-RPC 2.0 request per line to its stdin; the generator
 * answers with one JSON line per request on **stderr** (stdout is passed through to the
 * terminal, and non-JSON stderr lines are shown if the generator fails). Methods:
 *
 *   getManifest(config)  → { manifest: GeneratorManifest }
 *   generate(options)    → anything (null)
 *
 * Prisma stops the process (SIGTERM) after `generate`.
 */

export interface GeneratorManifest {
  readonly prettyName?: string;
  readonly defaultOutput?: string;
  readonly requiresEngines?: readonly string[];
  readonly version?: string;
}

/** The parts of a generator config block the generator reads. */
export interface GeneratorConfig {
  readonly name: string;
  readonly output: { readonly value: string | null } | null;
  readonly config: Readonly<Record<string, string | readonly string[] | undefined>>;
}

/** The parts of the `generate` request the generator reads. */
export interface GeneratorOptions {
  readonly generator: GeneratorConfig;
  /** The datamodel as Prisma schema text. */
  readonly datamodel: string;
  readonly dmmf: { readonly datamodel: unknown };
  readonly schemaPath: string;
  readonly datasources: readonly { readonly provider: string; readonly activeProvider?: string }[];
}

export interface GeneratorHandler {
  onManifest(config: GeneratorConfig): GeneratorManifest | Promise<GeneratorManifest>;
  onGenerate(options: GeneratorOptions): void | Promise<void>;
}

interface Request {
  readonly jsonrpc: "2.0";
  readonly id: number;
  readonly method: string;
  readonly params: unknown;
}

/** JSON-RPC error codes: method not found, and the server-error code used for failures. */
const METHOD_NOT_FOUND = -32601;
const SERVER_ERROR = -32000;

async function respond(handler: GeneratorHandler, req: Request): Promise<object> {
  try {
    switch (req.method) {
      case "getManifest":
        return { jsonrpc: "2.0", id: req.id, result: { manifest: await handler.onManifest(req.params as GeneratorConfig) } };
      case "generate":
        await handler.onGenerate(req.params as GeneratorOptions);
        return { jsonrpc: "2.0", id: req.id, result: null };
      default:
        return { jsonrpc: "2.0", id: req.id, error: { code: METHOD_NOT_FOUND, message: `Method not found: ${req.method}` } };
    }
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    return { jsonrpc: "2.0", id: req.id, error: { code: SERVER_ERROR, message: e.message, data: { stack: e.stack } } };
  }
}

/**
 * Serve the generator protocol: read requests from `input` (stdin), write responses to
 * `output` (stderr). Resolves when `input` ends.
 */
export function serveGenerator(handler: GeneratorHandler, input: Readable = process.stdin, output: Writable = process.stderr): Promise<void> {
  const pending: Promise<void>[] = [];
  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on("line", (line) => {
    if (line.trim() === "") return;
    let req: Request;
    try {
      req = JSON.parse(line) as Request;
    } catch {
      output.write(`typesql-prisma: ignoring a request that is not JSON: ${line}\n`);
      return;
    }
    pending.push(respond(handler, req).then((res) => void output.write(JSON.stringify(res) + "\n")));
  });
  return new Promise((resolve) => lines.on("close", () => void Promise.all(pending).then(() => resolve())));
}
