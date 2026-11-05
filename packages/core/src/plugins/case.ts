import type {
	IdentityPluginTypes,
	InputContext,
	SqlPlugin,
} from "../plugin.js";

type CamelCase<S extends string> = S extends `${string}_${string}`
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

type CamelCaseKeys<Row> = Row extends object
	? { [K in keyof Row as K extends string ? CamelCase<K> : K]: Row[K] }
	: Row;

function camelCase(key: string): string {
	if (!key.includes("_")) return key;
	let mapped = key[0] ?? "";
	for (let i = 1; i < key.length; i++) {
		const c = key[i] ?? "";
		if (c !== "_") mapped += key[i - 1] === "_" ? c.toUpperCase() : c;
	}
	return mapped;
}

type SnakeCase<S extends string> = string extends S
	? string
	: S extends Lowercase<S>
		? S
		: SnakeRest<S>;
type SnakeRest<S extends string> =
	S extends Lowercase<S>
		? S
		: S extends `${infer A}${infer B}${infer C}${infer D}${infer Tail}`
			? `${SnakeChar<A>}${SnakeChar<B>}${SnakeChar<C>}${SnakeChar<D>}${SnakeRest<Tail>}`
			: S extends `${infer Head}${infer Tail}`
				? `${SnakeChar<Head>}${SnakeRest<Tail>}`
				: S;
type SnakeChar<C extends string> =
	C extends Lowercase<C> ? C : `_${Lowercase<C>}`;

const snakeCase = (key: string): string =>
	key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

type SnakeCaseKeys<Row> = Row extends object
	? { [K in keyof Row as K extends string ? SnakeCase<K> : K]: Row[K] }
	: Row;

/**
 * Write keys: the camelCase key when it converts back to the column, else the
 * column name itself (`address_line_1`, whose camelCase `addressLine1` would
 * convert to `address_line1`). Keys without capitals are written unchanged.
 */
type InputKey<K extends string> =
	SnakeCase<CamelCase<K>> extends K ? CamelCase<K> : K;
type CamelCaseInputKeys<Row> = Row extends object
	? { [K in keyof Row as K extends string ? InputKey<K> : K]: Row[K] }
	: Row;

export interface CasePluginTypes extends IdentityPluginTypes {
	readonly input: this["context"]["kind"] extends "set" | "values"
		? CamelCaseInputKeys<this["value"]>
		: this["value"];
	readonly encoded: this["context"]["kind"] extends "set" | "values"
		? SnakeCaseKeys<this["value"]>
		: this["value"];
	readonly output: CamelCaseKeys<this["value"]>;
}

/**
 * A copy of a plain object or class instance with its own enumerable keys
 * renamed; anything else as is. fromEntries defines each key, so `__proto__`
 * stays a key.
 */
function mapKeys<V>(value: V, map: (key: string) => string) {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [map(key), item]),
	);
}

/** Camel-case application row/write keys; snake-case database write keys. JSON is untouched. */
export class CasePlugin implements SqlPlugin<CasePluginTypes> {
	declare readonly types?: CasePluginTypes;
	// biome-ignore lint/plugin: implements the public `SqlPlugin.transformInput` signature.
	transformInput(value: unknown, context: InputContext): unknown {
		return context.kind === "set" || context.kind === "values"
			? mapKeys(value, snakeCase)
			: value;
	}
	// biome-ignore lint/plugin: implements the public `SqlPlugin.transformOutput` signature.
	transformOutput(row: unknown): unknown {
		return mapKeys(row, camelCase);
	}
}
