import type { Completions } from "@typesql/core/editor";
import { expect, test } from "vitest";
import { merge } from "../src/merge.js";

const pos = (line: number, character: number) => ({ line, character });

/** `sql("SELECT * FROM us|")` on line 1: the literal starts at character 5. */
const ours: Completions = {
	items: [
		{
			label: "users",
			kind: "table",
			detail: "table",
			insertText: "users",
			sortText: "10000",
		},
		{
			label: "UserAccounts",
			kind: "table",
			detail: "table",
			insertText: '"UserAccounts"',
			sortText: "20001",
		},
	],
	replace: { start: 49, end: 51 },
	replaceRange: { start: pos(1, 19), end: pos(1, 21) },
	literal: { start: 35, end: 51 },
	literalRange: { start: pos(1, 5), end: pos(1, 21) },
};

const echo = {
	label: "SELECT * FROM us",
	kind: 21 as const,
	textEdit: {
		range: { start: pos(1, 5), end: pos(1, 21) },
		newText: "SELECT * FROM us",
	},
};
const other = { label: "unrelated", kind: 6 as const };

test("drops TypeScript's items that replace the literal and adds ours with an edit of the typed name", () => {
	const r = merge({ isIncomplete: false, items: [echo, other] }, ours);
	expect(r).toEqual({
		isIncomplete: false,
		items: [
			other,
			{
				label: "users",
				kind: 22,
				detail: "table",
				sortText: "10000",
				filterText: "users",
				textEdit: {
					range: { start: pos(1, 19), end: pos(1, 21) },
					newText: "users",
				},
			},
			{
				label: "UserAccounts",
				kind: 22,
				detail: "table",
				sortText: "20001",
				filterText: "UserAccounts",
				textEdit: {
					range: { start: pos(1, 19), end: pos(1, 21) },
					newText: '"UserAccounts"',
				},
			},
		],
	});
});

test("an insert/replace edit counts too; arrays and null stay arrays and null", () => {
	const insertReplace = {
		label: "x",
		textEdit: {
			insert: { start: pos(1, 5), end: pos(1, 21) },
			replace: { start: pos(1, 5), end: pos(1, 21) },
			newText: "x",
		},
	};
	expect(merge([insertReplace], { ...ours, items: [] })).toEqual([]);
	expect(merge(null, { ...ours, items: [] })).toBeNull();
	expect((merge(null, ours) as unknown[]).length).toBe(2);
});

test("outside a statement literal the response is unchanged", () => {
	const list = { isIncomplete: false, items: [echo] };
	expect(merge(list, null)).toBe(list);
});

test("an item whose edit starts on the literal's line at another character is kept", () => {
	const before = {
		label: "sql",
		kind: 6 as const,
		textEdit: { range: { start: pos(1, 0), end: pos(1, 3) }, newText: "sql" },
	};
	const after = {
		label: "x",
		kind: 6 as const,
		textEdit: {
			insert: { start: pos(1, 22), end: pos(1, 22) },
			replace: { start: pos(1, 22), end: pos(1, 23) },
			newText: "x",
		},
	};
	const r = merge([before, echo, after], { ...ours, items: [] });
	expect(r).toEqual([before, after]);
});

test("an item whose edit starts at the literal's character on another line is kept", () => {
	const below = {
		label: "y",
		kind: 6 as const,
		textEdit: { range: { start: pos(2, 5), end: pos(2, 6) }, newText: "y" },
	};
	expect(merge([echo, below], { ...ours, items: [] })).toEqual([below]);
});
