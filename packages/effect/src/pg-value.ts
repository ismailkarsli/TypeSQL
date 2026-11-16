import { jsonText } from "@typesql/core/adapter";
import { Predicate } from "effect";

const hex = (bytes: Uint8Array): string =>
	`\\x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

function element<V>(value: V): string {
	const v = intervalText(jsonText(value));
	if (v === null || v === undefined) return "NULL";
	if (Array.isArray(v)) return arrayText(v);
	if (typeof v === "number" || typeof v === "bigint" || typeof v === "boolean")
		return String(v);
	const text =
		typeof v === "string"
			? v
			: v instanceof Date
				? v.toISOString()
				: v instanceof Uint8Array
					? hex(v)
					: JSON.stringify(v);
	return `"${text.replace(/[\\"]/g, "\\$&")}"`;
}

const arrayText = (values: readonly unknown[]): string =>
	`{${values.map(element).join(",")}}`;

/** The driver reads this shape for an `interval` but does not bind it. */
const intervalText = <V>(value: V): V | string =>
	Predicate.isObject(value) &&
	Predicate.isNumber(value.months) &&
	Predicate.isNumber(value.days) &&
	Predicate.isBigInt(value.microseconds)
		? `${value.months} months ${value.days} days ${value.microseconds} microseconds`
		: value;

/**
 * The driver types an array from its elements, so strings for a `uuid[]`
 * parameter would be a `text[]`: arrays are sent as array text instead.
 */
export function pgValue<V>(value: V): V | string {
	const v = jsonText(value);
	return Array.isArray(v) ? arrayText(v) : intervalText(v);
}
