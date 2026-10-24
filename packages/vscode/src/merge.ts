/**
 * Adds TypeSQL's items to the language server's completion response for a statement literal.
 *
 * Inside the literal, TypeScript offers string literal completions for the query parameter: the
 * statement itself, with an edit that replaces the whole literal (several lines for a template
 * literal). Those are dropped; every other item is kept.
 */

import type {
	Completions,
	CompletionItem as SqlItem,
} from "@typesql/core/editor";
import type {
	CompletionItem,
	CompletionItemKind,
	CompletionList,
	Range,
} from "typescript/vscode";

type Result = CompletionItem[] | CompletionList | null;

const KINDS: { readonly [K in SqlItem["kind"]]: CompletionItemKind } = {
	table: 22, // Struct
	view: 8, // Interface
	cte: 22,
	namespace: 9, // Module
	column: 5, // Field
	alias: 6, // Variable
};

export function merge(result: Result, c: Completions | null): Result {
	if (!c) return result;
	const server =
		result === null ? [] : Array.isArray(result) ? result : result.items;
	const start = c.literalRange.start;
	const kept = server.filter((i) => {
		const edit = i.textEdit;
		const range: Range | undefined = edit
			? "range" in edit
				? edit.range
				: edit.replace
			: undefined;
		return !(
			range &&
			range.start.line === start.line &&
			range.start.character === start.character
		);
	});
	const ours = c.items.map(
		(i): CompletionItem => ({
			label: i.label,
			kind: KINDS[i.kind],
			detail: i.detail,
			sortText: i.sortText,
			filterText: i.label,
			textEdit: {
				range: { start: c.replaceRange.start, end: c.replaceRange.end },
				newText: i.insertText,
			},
		}),
	);
	const items = [...kept, ...ours];
	if (result === null) return items.length ? items : null;
	return Array.isArray(result) ? items : { ...result, items };
}
