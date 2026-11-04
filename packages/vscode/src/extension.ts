import * as path from "node:path";
import {
	type Completions,
	type Connector,
	mayBeInSqlLiteral,
	merge,
	mergeTokens,
	offsetOf,
	Session,
	type CompletionItem as SqlItem,
	type TokenLegend,
	type TokenNames,
	type TypeScriptModules,
	typescriptModules,
	withBudget,
} from "@typesql/language-server";
import type {
	ExtensionAPI,
	Range,
	SemanticTokens,
	TypeScriptSDK,
} from "typescript/vscode";
import * as vscode from "vscode";

const TYPESCRIPT_EXTENSION = "TypeScriptTeam.native-preview";
const NIGHTLY_EXTENSION = "TypeScriptTeam.vscode-typescript-nightly";
const UPGRADE =
	'Install the "TypeScript 7 Nightly" extension, or set "js/ts.tsdk.path" to a TypeScript 7.1 package and allow it.';
const BUDGET_MS = 150;
const HIGHLIGHT_BUDGET_MS = 500;
const LANGUAGES = [
	"typescript",
	"typescriptreact",
	"javascript",
	"javascriptreact",
];
// SQL tokens carry the definition modifier, which TypeScript never sets, and
// package.json's semanticTokenScopes map each of these to the grammar's scope,
// so they take the same colors as the grammar's SQL. Strings and comments stay
// plain, as in the grammar.
const SQL_TOKENS: TokenNames = {
	keyword: "keyword.definition",
	constant: "enumMember.definition",
	type: "type.definition",
	function: "function.definition",
	number: "number.definition",
	escape: "regexp.definition",
	operator: "operator.definition",
	parameter: "parameter.definition",
	variable: "variable.definition",
	punctuation: "string.definition",
};

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
		session = new Session({ ...connector, upgrade: UPGRADE }, (m) =>
			log.info(m),
		);
		void old?.close();
	};
	context.subscriptions.push({ dispose: () => void session?.close() });

	const complete = async (
		uri: string,
		position: { line: number; character: number },
		text: string | undefined,
	): Promise<Completions | null> => {
		const s = session;
		if (!s || !enabled()) return null;
		if (
			text !== undefined &&
			!mayBeInSqlLiteral(text, offsetOf(text, position))
		)
			return null;
		try {
			const started = Date.now();
			const ours = await withBudget(s.complete(uri, position, text), BUDGET_MS);
			if (ours === "late") {
				log.warn(`completions took longer than ${BUDGET_MS} ms; skipped`);
				return null;
			}
			if (ours)
				log.trace(`${ours.items.length} items in ${Date.now() - started} ms`);
			return ours;
		} catch (e) {
			log.error(e instanceof Error ? e : String(e));
			return null;
		}
	};

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
		try {
			const started = Date.now();
			const [ours, l] = await Promise.all([
				withBudget(s.highlight(uri), HIGHLIGHT_BUDGET_MS),
				legendFor(uri),
			]);
			if (ours === "late") {
				log.warn(
					`SQL highlighting took longer than ${HIGHLIGHT_BUDGET_MS} ms; skipped`,
				);
				return result;
			}
			if (!ours || !l) return result;
			log.trace(`${ours.length} SQL highlights in ${Date.now() - started} ms`);
			return mergeTokens(result, ours, l, range, SQL_TOKENS);
		} catch (e) {
			log.error(e instanceof Error ? e : String(e));
			return result;
		}
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
						async (): Promise<TypeScriptModules> => {
							const [async, ast] = await Promise.all([
								sdk.importModule("typescript/async"),
								sdk.importModule("typescript/ast"),
							]);
							const dir = sdk.packageJsonPath
								? path.dirname(sdk.packageJsonPath)
								: "(TypeScript 7 extension)";
							return {
								API: async.API,
								SyntaxKind: ast.SyntaxKind,
								dir,
								version: sdk.version,
							};
						},
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
			LANGUAGES.map((language) => ({ language, scheme: "file" })),
			{
				async provideCompletionItems(document, position) {
					const ours = await complete(
						document.uri.toString(),
						{ line: position.line, character: position.character },
						document.getText(),
					);
					return ours ? ours.items.map((i) => toItem(i, ours)) : undefined;
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
			typescriptModules(path.join(path.resolve(root, tsdk), "package.json")),
		);
	}
	candidates.push(() => typescriptModules(fileName));
	if (nightlyPath)
		candidates.push(() =>
			typescriptModules(path.join(nightlyPath, "package.json")),
		);
	return candidates;
}

const KINDS = {
	table: vscode.CompletionItemKind.Struct,
	view: vscode.CompletionItemKind.Interface,
	cte: vscode.CompletionItemKind.Struct,
	namespace: vscode.CompletionItemKind.Module,
	column: vscode.CompletionItemKind.Field,
	alias: vscode.CompletionItemKind.Variable,
} satisfies { readonly [K in SqlItem["kind"]]: vscode.CompletionItemKind };

function toItem(i: SqlItem, c: Completions): vscode.CompletionItem {
	const item = new vscode.CompletionItem(i.label, KINDS[i.kind]);
	item.detail = i.detail;
	item.sortText = i.sortText;
	item.filterText = i.label;
	item.insertText = i.insertText;
	const r = c.replaceRange;
	item.range = new vscode.Range(
		r.start.line,
		r.start.character,
		r.end.line,
		r.end.character,
	);
	return item;
}
