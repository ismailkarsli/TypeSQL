/**
 * TypeSQL for VS Code: completions inside `sql()` strings.
 *
 * Items come from `@typesql/core/editor` (the project's own copy) through an API session on the
 * TypeScript 7 extension's language server, so they read the server's program without a second
 * process. Two ways in, depending on that extension's API:
 *
 *  - With `registerLspMiddleware` (TypeScript 7.1's extension API): a middleware adds our items
 *    to the server's completion response and drops TypeScript's item that echoes the statement.
 *  - Without it (the TypeScript 7 extension 1.0): a completion provider of our own, next to
 *    TypeScript's. VS Code merges the two lists, so TypeScript's echo item stays.
 *
 * Anything that fails or takes longer than the budget adds nothing.
 */
import path = require("node:path");
import vscode = require("vscode");
import type { ExtensionAPI, TypeScriptSDK } from "typescript/vscode";
import type { Completions, CompletionItem as SqlItem } from "@typesql/core/editor";
import { mayBeInSqlLiteral } from "./literal.js";
import { merge } from "./merge.js";
import { Session, typescriptModules, type Connector, type TypeScriptModules } from "./session.js";

const TYPESCRIPT_EXTENSION = "TypeScriptTeam.native-preview";
const NIGHTLY_EXTENSION = "TypeScriptTeam.vscode-typescript-nightly";
/** Milliseconds a request may take before it adds nothing. */
const BUDGET_MS = 150;
const LANGUAGES = ["typescript", "typescriptreact", "javascript", "javascriptreact"];

/** The TypeScript 7 extension 1.0's API: no SDK, no middleware. */
interface LegacyAPI {
  onLanguageServerInitialized(listener: () => unknown): vscode.Disposable;
  initializeAPIConnection(pipe?: string): Promise<string>;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const log = vscode.window.createOutputChannel("TypeSQL", { log: true });
  context.subscriptions.push(log);
  const ts = vscode.extensions.getExtension<ExtensionAPI | LegacyAPI>(TYPESCRIPT_EXTENSION);
  if (!ts) {
    log.warn(`${TYPESCRIPT_EXTENSION} is not installed: completions in sql() strings need the TypeScript 7 extension`);
    return;
  }
  const api = await ts.activate();
  const hasMiddleware = typeof (api as Partial<ExtensionAPI> | undefined)?.registerLspMiddleware === "function";
  if (typeof api?.onLanguageServerInitialized !== "function" || (!hasMiddleware && typeof (api as LegacyAPI).initializeAPIConnection !== "function")) {
    log.warn(`${TYPESCRIPT_EXTENSION} ${String(ts.packageJSON.version)} has no API for other extensions; no completions`);
    return;
  }
  const enabled = (): boolean => vscode.workspace.getConfiguration("typesql").get<boolean>("completions.enable", true);
  const textOf = (uri: string): string | undefined => vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri)?.getText();

  let session: Session | undefined;
  const restart = (connector: Connector): void => {
    const old = session;
    session = new Session(connector, (m) => log.info(m));
    void old?.close();
  };
  context.subscriptions.push({ dispose: () => void session?.close() });

  /** Our completions, or undefined when there are none, the request failed or it was late. */
  const complete = async (uri: string, position: { line: number; character: number }, text: string | undefined): Promise<Completions | null | undefined> => {
    const s = session;
    if (!s || !enabled()) return undefined;
    if (text !== undefined && !mayBeInSqlLiteral(text, offsetOf(text, position))) return undefined;
    try {
      const started = Date.now();
      const ours = await withBudget(s.complete(uri, position, text));
      if (ours === "late") {
        log.warn(`completions took longer than ${BUDGET_MS} ms; skipped`);
        return undefined;
      }
      if (ours) log.trace(`${ours.items.length} items in ${Date.now() - started} ms`);
      return ours;
    } catch (e) {
      log.error(e instanceof Error ? e : String(e));
      return undefined;
    }
  };

  if (hasMiddleware) {
    const full = api as ExtensionAPI;
    context.subscriptions.push(
      full.onLanguageServerInitialized((sdk: TypeScriptSDK) => {
        log.info(`TypeScript ${sdk.version} language server initialized`);
        restart({
          pipe: () => sdk.initializeAPIConnection(),
          // the server's own installation
          modules: () => [
            async (): Promise<TypeScriptModules> => {
              const [async, ast] = await Promise.all([sdk.importModule("typescript/async"), sdk.importModule("typescript/ast")]);
              const dir = sdk.packageJsonPath ? path.dirname(sdk.packageJsonPath) : "(TypeScript 7 extension)";
              return { API: async.API, SyntaxKind: ast.SyntaxKind as unknown as Record<string, number>, dir, version: sdk.version };
            },
          ],
        });
      }),
      full.registerLspMiddleware("textDocument/completion", async (result, { params }) => {
        const ours = await complete(params.textDocument.uri, params.position, textOf(params.textDocument.uri));
        return ours === undefined ? result : merge(result, ours);
      }),
    );
    return;
  }

  // the TypeScript 7 extension 1.0: a provider of our own
  const legacy = api as LegacyAPI;
  log.info(`${TYPESCRIPT_EXTENSION} ${String(ts.packageJSON.version)} has no LSP middleware: completions come from a separate provider, and TypeScript's item with the statement text stays in the list`);
  const nightly = (): string | undefined => vscode.extensions.getExtension(NIGHTLY_EXTENSION)?.extensionPath;
  context.subscriptions.push(
    legacy.onLanguageServerInitialized(() => {
      log.info("TypeScript language server initialized");
      restart({ pipe: () => legacy.initializeAPIConnection(), modules: (fileName) => legacyCandidates(fileName, nightly()) });
    }),
    vscode.languages.registerCompletionItemProvider(
      LANGUAGES.map((language) => ({ language, scheme: "file" })),
      {
        async provideCompletionItems(document, position) {
          const ours = await complete(document.uri.toString(), { line: position.line, character: position.character }, document.getText());
          return ours ? ours.items.map((i) => toItem(i, ours)) : undefined;
        },
      },
      " ", ".", "(", ",",
    ),
  );
}

export function deactivate(): void {}

/**
 * API packages that may match the server of a TypeScript 7 extension 1.0, which does not say
 * which one it started: the `js/ts.tsdk.path` package, the project's `typescript`, the nightly
 * extension's. The session keeps the first the server understands.
 */
function legacyCandidates(fileName: string, nightlyPath: string | undefined): (() => Promise<TypeScriptModules>)[] {
  const candidates: (() => Promise<TypeScriptModules>)[] = [];
  const tsdk = vscode.workspace.getConfiguration("js/ts").get<string>("tsdk.path");
  if (tsdk) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? path.dirname(fileName);
    candidates.push(() => typescriptModules(path.join(path.resolve(root, tsdk), "package.json")));
  }
  candidates.push(() => typescriptModules(fileName));
  if (nightlyPath) candidates.push(() => typescriptModules(path.join(nightlyPath, "package.json")));
  return candidates;
}

const KINDS: { readonly [K in SqlItem["kind"]]: vscode.CompletionItemKind } = {
  table: vscode.CompletionItemKind.Struct,
  view: vscode.CompletionItemKind.Interface,
  cte: vscode.CompletionItemKind.Struct,
  namespace: vscode.CompletionItemKind.Module,
  column: vscode.CompletionItemKind.Field,
  alias: vscode.CompletionItemKind.Variable,
};

function toItem(i: SqlItem, c: Completions): vscode.CompletionItem {
  const item = new vscode.CompletionItem(i.label, KINDS[i.kind]);
  item.detail = i.detail;
  item.sortText = i.sortText;
  item.filterText = i.label;
  item.insertText = i.insertText;
  const r = c.replaceRange;
  item.range = new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
  return item;
}

function offsetOf(text: string, p: { line: number; character: number }): number {
  let offset = 0;
  for (let line = 0; line < p.line; line++) {
    const nl = text.indexOf("\n", offset);
    if (nl < 0) return text.length;
    offset = nl + 1;
  }
  return offset + p.character;
}

function withBudget<T>(p: Promise<T>): Promise<T | "late"> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<"late">((resolve) => (timer = setTimeout(() => resolve("late"), BUDGET_MS)));
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}
