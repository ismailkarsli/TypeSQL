import type { JsonMarker } from "../sql/inline.js";
import { param } from "./inline.js";

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
	return param(
		value === null || value === undefined ? null : new JsonParam(value),
	) as unknown as JsonMarker<T>;
}
