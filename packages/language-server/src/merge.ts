import type {
	CompletionItem,
	CompletionItemKind,
	CompletionList,
	Range,
} from "typescript/vscode";
import type {
	Completions,
	CompletionItem as SqlItem,
} from "./complete/complete.js";

type Result = CompletionItem[] | CompletionList | null;

const KINDS = {
	table: 22,
	view: 8,
	cte: 22,
	namespace: 9,
	column: 5,
	alias: 6,
} satisfies { readonly [K in SqlItem["kind"]]: CompletionItemKind };

/** The items of `c` as LSP completion items, each replacing the name typed so far. */
export function lspItems(c: Completions): CompletionItem[] {
	const { start, end } = c.replaceRange;
	return c.items.map((i) => ({
		label: i.label,
		kind: KINDS[i.kind],
		detail: i.detail,
		sortText: i.sortText,
		filterText: i.label,
		textEdit: { range: { start, end }, newText: i.insertText },
	}));
}

/**
 * Adds the items of `c` to a completion response, dropping the response's
 * items that would replace the SQL literal from its start.
 */
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
	const items = [...kept, ...lspItems(c)];
	if (result === null) return items.length ? items : null;
	return Array.isArray(result) ? items : { ...result, items };
}
