import * as path from "node:path";
import {
	type Connector,
	lspItems,
	merge,
	mergeTokens,
	Session,
	type TokenLegend,
	type TokenNames,
	type TypeScriptModules,
	typescriptModules,
	typescriptModulesFrom,
} from "@typesql/language-server";
import type {
	ExtensionAPI,
	CompletionItem as LspItem,
	Range,
	SemanticTokens,
	TypeScriptSDK,
} from "typescript/vscode";
import * as vscode from "vscode";
import { LANGUAGES, SQL_TOKENS } from "./contributes.mjs";

const TYPESCRIPT_EXTENSION = "TypeScriptTeam.native-preview";
const NIGHTLY_EXTENSION = "TypeScriptTeam.vscode-typescript-nightly";
const UPGRADE =
	'Install the "TypeScript 7 Nightly" extension, or set "js/ts.tsdk.path" to a TypeScript 7.1 package and allow it.';
const TOKEN_NAMES: TokenNames = Object.fromEntries(
	Object.entries(SQL_TOKENS).flatMap(([kind, t]) =>
		t ? [[kind, t.token]] : [],
	),
);

interface LegacyAPI {
	onLanguageServerInitialized(listener: () => void): vscode.Disposable;
	initializeAPIConnection(pipe?: string): Promise<string>;
}

export async function activate(
	context: vscode.ExtensionContext,
): Promise<void> {
	const log = vscode.window.createOutputChannel("TypeSQL", { log: true });
	context.subscriptions.push(log);
	const ts = vscode.extensions.getExtension<ExtensionAPI | LegacyAPI>(
		TYPESCRIPT_EXTENSION,
	);
	if (!ts) {
		log.warn(
			`${TYPESCRIPT_EXTENSION} is not installed: completions in sql() strings need the TypeScript 7 extension`,
		);
		return;
	}
	const api = await ts.activate();
	const hasMiddleware = hasLspMiddleware(api);
	if (
		typeof api?.onLanguageServerInitialized !== "function" ||
		(!hasMiddleware && typeof api.initializeAPIConnection !== "function")
	) {
		log.warn(
			`${TYPESCRIPT_EXTENSION} ${String(ts.packageJSON.version)} has no API for other extensions; no completions`,
		);
		return;
	}
	const enabled = (): boolean =>
		vscode.workspace
			.getConfiguration("typesql")
			.get<boolean>("completions.enable", true);
	const highlighting = (): boolean =>
		vscode.workspace
			.getConfiguration("typesql")
			.get<boolean>("semanticHighlighting.enable", true);
	const textOf = (uri: string): string | undefined =>
		vscode.workspace.textDocuments
			.find((d) => d.uri.toString() === uri)
			?.getText();

	let session: Session | undefined;
	const restart = (connector: Connector): void => {
		const old = session;
		session = new Session(
			{ ...connector, upgrade: UPGRADE },
			(m, level = "info") => log[level](m),
		);
		void old?.close();
	};
	context.subscriptions.push({ dispose: () => void session?.close() });

	const complete = async (
		uri: string,
		position: { line: number; character: number },
		text: string | undefined,
	) => (session && enabled() ? session.complete(uri, position, text) : null);

	// TypeScript's token legend, read from VS Code once per server start; a
	// failed read is retried on the next request.
	let legend: Promise<TokenLegend | null> | undefined;
	const legendFor = (uri: string): Promise<TokenLegend | null> => {
		legend ??= Promise.resolve(
			vscode.commands.executeCommand<vscode.SemanticTokensLegend | undefined>(
				"vscode.provideDocumentSemanticTokensLegend",
				vscode.Uri.parse(uri),
			),
		).then(
			(l) => l ?? null,
			() => null,
		);
		return legend.then((l) => {
			if (!l) legend = undefined;
			return l;
		});
	};
	const highlight = async (
		result: SemanticTokens | null,
		uri: string,
		range?: Range,
	): Promise<SemanticTokens | null> => {
		const s = session;
		if (!s || !highlighting()) return result;
		const [ours, l] = await Promise.all([s.highlight(uri), legendFor(uri)]);
		return ours && l
			? mergeTokens(result, ours, l, range, TOKEN_NAMES)
			: result;
	};

	if (hasMiddleware) {
		const full = api;
		context.subscriptions.push(
			full.onLanguageServerInitialized((sdk: TypeScriptSDK) => {
				log.info(`TypeScript ${sdk.version} language server initialized`);
				legend = undefined;
				restart({
					pipe: () => sdk.initializeAPIConnection(),
					modules: () => [
						() =>
							typescriptModules(
								sdk,
								sdk.packageJsonPath
									? path.dirname(sdk.packageJsonPath)
									: "(TypeScript 7 extension)",
								sdk.version,
							),
					],
				});
			}),
			full.registerLspMiddleware(
				"textDocument/semanticTokens/full",
				(result, { params }) => highlight(result, params.textDocument.uri),
			),
			full.registerLspMiddleware(
				"textDocument/semanticTokens/range",
				(result, { params }) =>
					highlight(result, params.textDocument.uri, params.range),
			),
			full.registerLspMiddleware(
				"textDocument/completion",
				async (result, { params }) =>
					merge(
						result,
						await complete(
							params.textDocument.uri,
							params.position,
							textOf(params.textDocument.uri),
						),
					),
			),
		);
		return;
	}

	const legacy = api;
	log.info(
		`${TYPESCRIPT_EXTENSION} ${String(ts.packageJSON.version)} has no LSP middleware: completions come from a separate provider, and TypeScript's item with the statement text stays in the list`,
	);
	const nightly = (): string | undefined =>
		vscode.extensions.getExtension(NIGHTLY_EXTENSION)?.extensionPath;
	context.subscriptions.push(
		legacy.onLanguageServerInitialized(() => {
			log.info("TypeScript language server initialized");
			restart({
				pipe: () => legacy.initializeAPIConnection(),
				modules: (fileName) => legacyCandidates(fileName, nightly()),
			});
		}),
		vscode.languages.registerCompletionItemProvider(
			Object.keys(LANGUAGES).map((language) => ({ language, scheme: "file" })),
			{
				async provideCompletionItems(document, position) {
					const ours = await complete(
						document.uri.toString(),
						{ line: position.line, character: position.character },
						document.getText(),
					);
					return ours ? lspItems(ours).map(toItem) : undefined;
				},
			},
			" ",
			".",
			"(",
			",",
		),
	);
}

export function deactivate(): void {}

// Versions of the TypeScript 7 extension before LSP middleware expose only LegacyAPI.
function hasLspMiddleware(
	api: ExtensionAPI | LegacyAPI | undefined,
): api is ExtensionAPI {
	return (
		typeof api === "object" &&
		api !== null &&
		"registerLspMiddleware" in api &&
		typeof api.registerLspMiddleware === "function"
	);
}

function legacyCandidates(
	fileName: string,
	nightlyPath: string | undefined,
): (() => Promise<TypeScriptModules>)[] {
	const candidates: (() => Promise<TypeScriptModules>)[] = [];
	const tsdk = vscode.workspace
		.getConfiguration("js/ts")
		.get<string>("tsdk.path");
	if (tsdk) {
		const root =
			vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
			path.dirname(fileName);
		candidates.push(() =>
			typescriptModulesFrom(
				path.join(path.resolve(root, tsdk), "package.json"),
			),
		);
	}
	candidates.push(() => typescriptModulesFrom(fileName));
	if (nightlyPath)
		candidates.push(() =>
			typescriptModulesFrom(path.join(nightlyPath, "package.json")),
		);
	return candidates;
}

// An LSP item as VS Code's: its CompletionItemKind is LSP's less one.
function toItem(i: LspItem): vscode.CompletionItem {
	const item = new vscode.CompletionItem(
		i.label,
		i.kind === undefined ? undefined : i.kind - 1,
	);
	if (i.detail !== undefined) item.detail = i.detail;
	if (i.sortText !== undefined) item.sortText = i.sortText;
	if (i.filterText !== undefined) item.filterText = i.filterText;
	const edit = i.textEdit;
	if (edit && "range" in edit) {
		const r = edit.range;
		item.insertText = edit.newText;
		item.range = new vscode.Range(
			r.start.line,
			r.start.character,
			r.end.line,
			r.end.character,
		);
	}
	return item;
}
