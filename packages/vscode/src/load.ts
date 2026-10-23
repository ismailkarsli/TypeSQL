/**
 * Finds the `@typesql/core/editor` a file's project uses: `@typesql/core` resolved from the file,
 * or through an adapter (`@typesql/pg`, …) when core is only its dependency. The project's own
 * copy is loaded, so completions follow its version of the engine.
 */
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import type * as Editor from "@typesql/core/editor";

export type EditorModule = typeof Editor;

const ADAPTERS = ["@typesql/pg", "@typesql/postgres", "@typesql/kysely", "@typesql/drizzle", "@typesql/prisma"];

/** The path of the `@typesql/core/editor` module for `fileName`, or null. */
export function editorPath(fileName: string): string | null {
  const req = createRequire(fileName);
  for (const via of [null, ...ADAPTERS]) {
    try {
      return (via === null ? req : createRequire(req.resolve(via))).resolve("@typesql/core/editor");
    } catch {
      // not installed, or a version of @typesql/core without editor support
    }
  }
  return null;
}

/** Loads editor modules, once per directory and once per module path. */
export class Loader {
  private readonly byDir = new Map<string, Promise<EditorModule | null>>();
  private readonly byPath = new Map<string, Promise<EditorModule>>();

  constructor(private readonly log: (message: string) => void) {}

  load(fileName: string): Promise<EditorModule | null> {
    const dir = dirname(fileName);
    let m = this.byDir.get(dir);
    if (!m) {
      m = this.resolve(fileName);
      this.byDir.set(dir, m);
    }
    return m;
  }

  private async resolve(fileName: string): Promise<EditorModule | null> {
    const path = editorPath(fileName);
    if (path === null) {
      this.log(`no @typesql/core with an "./editor" export found from ${dirname(fileName)}`);
      return null;
    }
    let m = this.byPath.get(path);
    if (!m) {
      this.log(`loading ${path}`);
      m = import(pathToFileURL(path).href) as Promise<EditorModule>;
      this.byPath.set(path, m);
    }
    return m;
  }
}
