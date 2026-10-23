/**
 * An API session on the TypeScript 7 language server, and completions through it. No `vscode`
 * import: the extension passes in how to reach the server.
 */
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { API, Snapshot } from "typescript/async";
import type { Completions } from "@typesql/core/editor";
import { Loader } from "./load.js";

/** The parts of TypeScript's API package a session uses. */
export interface TypeScriptModules {
  readonly API: typeof API;
  readonly SyntaxKind: Readonly<Record<string, number>>;
  /** The package's directory and version, for logs. */
  readonly dir: string;
  readonly version: string;
}

/** How to reach a language server: an API pipe, and the API package to talk to it with. */
export interface Connector {
  /** Opens a new API pipe on the server. */
  pipe(): Promise<string>;
  /**
   * API packages that may match the server, most likely first; `fileName` is the file of the
   * first request. The client must be the server's version: the first one that can read the
   * server's snapshot is used.
   */
  modules(fileName: string): readonly (() => Promise<TypeScriptModules>)[];
}

/** Loads `typescript/async` and `typescript/ast` of the `typescript` package resolved from `from` (a file). */
export async function typescriptModules(from: string): Promise<TypeScriptModules> {
  const req = createRequire(from);
  const manifest = req.resolve("typescript/package.json");
  const load = (spec: string): Promise<Record<string, unknown>> => import(pathToFileURL(req.resolve(spec)).href) as Promise<Record<string, unknown>>;
  const [api, ast, pkg] = await Promise.all([load("typescript/async"), load("typescript/ast"), Promise.resolve(req(manifest) as { version?: string })]);
  return { API: api.API as typeof API, SyntaxKind: ast.SyntaxKind as Record<string, number>, dir: realpathSync(dirname(manifest)), version: pkg.version ?? "unknown" };
}

export interface Position {
  readonly line: number;
  readonly character: number;
}

interface Connection {
  readonly api: API<true>;
  readonly syntaxKind: Readonly<Record<string, number>>;
}

/** The server is TypeScript 7.0: its API has no language server snapshots. */
const IS_7_0 = /unknown API method "getCurrentLanguageServerSnapshot"/;

export class Session {
  private connection: Promise<Connection | null> | undefined;
  private readonly loader: Loader;

  constructor(
    private readonly connector: Connector,
    private readonly log: (message: string) => void,
  ) {
    this.loader = new Loader(log);
  }

  /** A session with an API client the server understands, or null (logged once) when there is none. */
  private connect(uri: string, fileName: string): Promise<Connection | null> {
    this.connection ??= this.open(uri, fileName).catch((e: unknown) => {
      this.connection = undefined;
      throw e;
    });
    return this.connection;
  }

  private async open(uri: string, fileName: string): Promise<Connection | null> {
    const tried = new Set<string>();
    const failures: string[] = [];
    for (const candidate of this.connector.modules(fileName)) {
      let ts: TypeScriptModules;
      try {
        ts = await candidate();
      } catch {
        continue; // not installed there, or a TypeScript without the API package
      }
      if (tried.has(ts.dir)) continue;
      tried.add(ts.dir);
      const api = await ts.API.fromLSPConnection({ pipe: await this.connector.pipe() });
      try {
        const snapshot = await api.getCurrentLanguageServerSnapshot();
        try {
          // a client of another version fails at the first request about a project
          const project = await snapshot.getDefaultProjectForFile({ uri });
          if (project) await Promise.all([project.program.getSourceFile({ uri }), project.checker.getStringType()]);
        } finally {
          void snapshot.dispose();
        }
        this.log(`API session open (client: typescript ${ts.version} at ${ts.dir})`);
        return { api, syntaxKind: ts.SyntaxKind };
      } catch (e) {
        void api.close().catch(() => {});
        if (IS_7_0.test(String(e))) {
          this.log(
            "the language server runs TypeScript 7.0, whose API cannot read the editor's program: completions need TypeScript 7.1. " +
              'Install the "TypeScript 7 Nightly" extension, or set "js/ts.tsdk.path" to a TypeScript 7.1 package and allow it.',
          );
          return null;
        }
        failures.push(`typescript ${ts.version} at ${ts.dir}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    this.log(`no TypeScript API client matches the language server; completions are off until it restarts. Tried:\n  ${failures.join("\n  ") || "(no TypeScript 7.1 package found)"}`);
    return null;
  }

  /**
   * Our completions at `position`, or null outside a statement literal. `text` is the editor's
   * text of the document: when the server has not applied the latest edit yet, the request reads
   * it from a snapshot with that text instead.
   */
  async complete(uri: string, position: Position, text?: string): Promise<Completions | null> {
    if (!uri.startsWith("file:")) return null;
    const fileName = fileURLToPath(uri);
    const editor = await this.loader.load(fileName);
    if (!editor) return null;
    const connection = await this.connect(uri, fileName);
    if (!connection) return null;
    const { api, syntaxKind } = connection;
    const run = async (s: Snapshot): Promise<Completions | null> => {
      const project = await s.getDefaultProjectForFile({ uri });
      if (!project) return null;
      return editor.completionsAt(project.program, project.checker, editor.editorKinds(syntaxKind), { uri }, position, editor.isCorePath);
    };
    const snapshot = await api.getCurrentLanguageServerSnapshot();
    try {
      if (text !== undefined) {
        const project = await snapshot.getDefaultProjectForFile({ uri });
        const current = await project?.program.getSourceFile({ uri });
        if (current && current.text !== text) {
          let result: Completions | null = null;
          await api.runWithTemporaryFileUpdate(snapshot, { uri }, text, async (s) => {
            result = await run(s);
          });
          return result;
        }
      }
      return await run(snapshot);
    } finally {
      void snapshot.dispose();
    }
  }

  async close(): Promise<void> {
    const c = this.connection;
    this.connection = undefined;
    try {
      await (await c)?.api.close();
    } catch {
      // the server is gone already
    }
  }
}
