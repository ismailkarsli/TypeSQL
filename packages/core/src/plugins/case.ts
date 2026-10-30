import type {
	IdentityPluginTypes,
	InputContext,
	SqlPlugin,
} from "../plugin.js";

export type CamelCase<S extends string> = S extends `${string}_${string}`
	? S extends `${infer H}${infer R}`
		? `${H}${CamelRest<R, H extends "_" ? true : false>}`
		: S
	: S;
type CamelRest<
	S extends string,
	Up extends boolean,
> = S extends `${infer A}_${infer B}`
	? `${Up extends true ? Capitalize<A> : A}${CamelRest<B, true>}`
	: Up extends true
		? Capitalize<S>
		: S;

export type CamelCaseKeys<Row> = Row extends object
	? { [K in keyof Row as K extends string ? CamelCase<K> : K]: Row[K] }
	: Row;

function camelCased(key: string): string {
	let mapped = key[0]!;
	for (let i = 1; i < key.length; i++) {
		const c = key[i]!;
		if (c !== "_") mapped += key[i - 1] === "_" ? c.toUpperCase() : c;
	}
	return mapped;
}

export function camelCase(key: string): string {
	return key.includes("_") ? camelCased(key) : key;
}

export type SnakeCase<S extends string> = string extends S
	? string
	: S extends Lowercase<S>
		? S
		: S extends `${infer Head}${infer Tail}`
			? `${Head extends Lowercase<Head> ? Head : `_${Lowercase<Head>}`}${SnakeCase<Tail>}`
			: S;

export function snakeCase(key: string): string {
	let result = "";
	let start = 0;
	for (let i = 0; i < key.length; i++) {
		const code = key.charCodeAt(i);
		if (code < 65 || code > 90) continue;
		result += `${key.slice(start, i)}_${String.fromCharCode(code + 32)}`;
		start = i + 1;
	}
	return start === 0 ? key : result + key.slice(start);
}

export type SnakeCaseKeys<Row> = Row extends object
	? { [K in keyof Row as K extends string ? SnakeCase<K> : K]: Row[K] }
	: Row;

export interface CasePluginTypes extends IdentityPluginTypes {
	readonly input: this["context"]["kind"] extends "set" | "values"
		? CamelCaseKeys<this["value"]>
		: this["value"];
	readonly encoded: this["context"]["kind"] extends "set" | "values"
		? SnakeCaseKeys<this["value"]>
		: this["value"];
	readonly output: CamelCaseKeys<this["value"]>;
}

function mapKeys(value: unknown, map: (key: string) => string): unknown {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		return value;
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(value)) {
		const mapped = map(key);
		const item = (value as Record<string, unknown>)[key];
		if (mapped === "__proto__") {
			Object.defineProperty(out, mapped, {
				value: item,
				enumerable: true,
				configurable: true,
				writable: true,
			});
		} else out[mapped] = item;
	}
	return out;
}

/** Camel-case application row/write keys; snake-case database write keys. JSON is untouched. */
export class CasePlugin implements SqlPlugin<CasePluginTypes> {
	declare readonly types?: CasePluginTypes;
	transformInput(value: unknown, context: InputContext): unknown {
		return context.kind === "set" || context.kind === "values"
			? mapKeys(value, snakeCase)
			: value;
	}
	transformOutput(row: unknown): unknown {
		return mapKeys(row, camelCase);
	}
}
