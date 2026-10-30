import { isSlottable } from "../query.js";
import type { SlotMap } from "../sql/slots.js";
import { hasInline, resolveInline, takeValue } from "./inline.js";
import { maxParam, rewriteNamed, splice } from "./splice.js";

function isSlotMap(v: unknown): v is SlotMap {
	if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
	const values = Object.values(v as Record<string, unknown>);
	if (values.length === 0) return false;
	for (const x of values) {
		if (!isSlottable(x)) return false;
	}
	return true;
}

const SLOT_RE = /\{[A-Za-z_][A-Za-z0-9_]*\}/;

const NAMED_RE = /(^|[^:]):[A-Za-z_]/;

export function namedValues(
	names: readonly string[],
	args: readonly unknown[],
): unknown[] {
	const obj = args[0];
	if (args.length !== 1 || obj === null || typeof obj !== "object") {
		throw new Error(
			"typesql: a statement with :name parameters takes exactly one object argument",
		);
	}
	const record = obj as Record<string, unknown>;
	return names.map((name) => {
		if (!(name in record))
			throw new Error(`typesql: missing named parameter :${name}`);
		return takeValue(record[name]);
	});
}

export function build(
	text: string,
	rest: readonly unknown[],
): { text: string; values: unknown[] } {
	let slots: SlotMap | null = null;
	let outer: readonly unknown[] = rest;
	if (rest.length > 0 && SLOT_RE.test(text) && isSlotMap(rest[0])) {
		slots = rest[0];
		outer = rest.slice(1);
	}
	let positional = text;
	let values: unknown[] = outer.length === 0 ? [] : outer.map(takeValue);
	if (text.includes(":") && NAMED_RE.test(text)) {
		const rn = rewriteNamed(text);
		if (rn.names.length > 0) {
			values = namedValues(rn.names, outer);
			positional = rn.text;
		}
	}
	if (hasInline(positional)) {
		const r = resolveInline(
			positional,
			Math.max(maxParam(positional), values.length),
		);
		positional = r.text;
		values = values.length === 0 ? r.values : [...values, ...r.values];
	}
	return slots
		? splice(positional, slots, values)
		: { text: positional, values };
}
