import { empty } from "../empty.js";
import type { JsonMarker } from "../sql/inline.js";
import { holdsMarkers, param } from "./inline.js";

export class JsonParam<T = unknown> {
	readonly value: T;

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
		return JSON.stringify(this.value);
	}
}

export function json<const T>(value: T): JsonMarker<T> {
	// The marker would be stored as text, and with it its secret prefix.
	if (holdsMarkers(value))
		throw new Error(
			"typesql: sql.json() takes a plain value; a sql.param() or sql.json() inside it would be stored as its marker text",
		);
	return param(
		value === undefined ? empty : value === null ? null : new JsonParam(value),
		// biome-ignore lint/nursery/noUnsafeTypeAssertion: the marker is a string branded with the value's type.
	) as JsonMarker<T>;
}
