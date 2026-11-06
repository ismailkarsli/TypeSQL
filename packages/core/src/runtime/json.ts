import { empty } from "../empty.js";
import type { JsonMarker } from "../sql/inline.js";
import { fail, HOLDS, holdsMarkers, param } from "./compile.js";

export class JsonParam<T = unknown> {
	declare readonly value: T;

	constructor(value: T) {
		this.value = value;
	}
	toPostgres(): string {
		return JSON.stringify(this.value);
	}
	toJSON(): T {
		return this.value;
	}
	toString(): string {
		return this.toPostgres();
	}
}

/** A value as a driver that takes JSON as text binds it: `sql.json()` values as JSON text. */
export const jsonText = <V>(value: V): V | string =>
	value instanceof JsonParam ? value.toPostgres() : value;

export function json<const T>(value: T): JsonMarker<T> {
	// The marker would be stored as text, and with it its secret prefix.
	if (holdsMarkers(value)) fail(HOLDS);
	return param(
		value === undefined ? empty : value === null ? null : new JsonParam(value),
		// biome-ignore lint/nursery/noUnsafeTypeAssertion: the marker is a string branded with the value's type.
	) as JsonMarker<T>;
}
