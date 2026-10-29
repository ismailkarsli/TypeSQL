import type {
	CompletionItem,
	CompletionItemKind,
	CompletionList,
	Range,
} from "typescript/vscode";
import type {
	Completions,
	CompletionItem as SqlItem,
} from "./complete/index.js";

type Result = CompletionItem[] | CompletionList | null;

const KINDS: { readonly [K in SqlItem["kind"]]: CompletionItemKind } = {
	table: 22,
	view: 8,
	cte: 22,
	namespace: 9,
	column: 5,
	alias: 6,
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
