import {
	hasInline,
	resolveFragments,
	resolveInline,
	takeValue,
} from "./inline.js";
import { maxParam, rewriteNamed, type SlotValues, splice } from "./splice.js";

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
	transformParameters?: (args: readonly unknown[]) => readonly unknown[],
): { text: string; values: unknown[] } {
	const inlined = hasInline(text) ? resolveFragments(text) : null;
	const slots: SlotValues | null = inlined ? inlined.slots : null;
	const outer = transformParameters ? transformParameters(rest) : rest;
	let positional = inlined ? inlined.text : text;
	let values: unknown[] = outer.length === 0 ? [] : outer.map(takeValue);
	if (positional.includes(":") && NAMED_RE.test(positional)) {
		const rn = rewriteNamed(positional);
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
