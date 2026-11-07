import { empty } from "../empty.js";
import type {
	IdentityPluginTypes,
	InputContext,
	SqlPlugin,
} from "../plugin.js";
import { fail } from "../runtime/compile.js";

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
		: S extends `${infer H}${infer R}`
			? SnakeRest<R, IsUpper<H>, Lowercase<H>>
			: S;
type IsUpper<C extends string> = C extends Lowercase<C> ? false : true;
type StartsLower<S extends string> = S extends `${infer C}${string}`
	? C extends Uppercase<C>
		? false
		: true
	: false;
type SnakeRest<
	S extends string,
	PrevUpper extends boolean,
	Acc extends string,
> = S extends `${infer C}${infer R}`
	? SnakeRest<
			R,
			IsUpper<C>,
			`${Acc}${IsUpper<C> extends true
				? [PrevUpper, StartsLower<R>] extends [true, false]
					? Lowercase<C>
					: `_${Lowercase<C>}`
				: C}`
		>
	: Acc;

const isUpper = (c: string): boolean => c !== c.toLowerCase();
const isLower = (c: string): boolean => c !== c.toUpperCase();

/**
 * What `SnakeCase` does. A run of capitals is one word and the first character
 * takes no `_`; a capital that ends a run before a lower case letter starts the
 * next word: `userID` is `user_id`, `HTTPCode` is `http_code`.
 */
export function snakeCase(key: string): string {
	if (key === key.toLowerCase()) return key;
	let mapped = (key[0] ?? "").toLowerCase();
	for (let i = 1; i < key.length; i++) {
		const c = key[i] ?? "";
		mapped += !isUpper(c)
			? c
			: isUpper(key[i - 1] ?? "") && !isLower(key[i + 1] ?? "")
				? c.toLowerCase()
				: `_${c.toLowerCase()}`;
	}
	return mapped;
}

/** The case of the application's keys. The database's keys are in the other one. */
export type KeyCase = "camelCase" | "snake_case";
type Opposite<To extends KeyCase> = To extends "camelCase"
	? "snake_case"
	: "camelCase";
type Cased<K extends string, To extends KeyCase> = To extends "camelCase"
	? CamelCase<K>
	: SnakeCase<K>;

/**
 * Write keys: the application's key when it converts back to the database's,
 * else the database's key itself (`address_line_1`, whose camelCase
 * `addressLine1` would convert to `address_line1`, and `point_x_y`, whose
 * `pointXY` would convert to `point_xy`).
 */
type InputKey<K extends string, To extends KeyCase> =
	Cased<Cased<K, To>, Opposite<To>> extends K ? Cased<K, To> : K;

/** A key `Rename` gives: `Input` for what the application writes, else for the name itself. */
type RenamedKey<K, To extends KeyCase, Input extends boolean> = K extends string
	? Input extends true
		? InputKey<K, To>
		: Cased<K, To>
	: K;

/** JSON has no functions: an object with a method (`Date`, `Buffer`, a class) keeps its keys. */
type MethodOf<O> = {
	[K in keyof O]-?: 0 extends 1 & O[K]
		? never
		: O[K] extends (...args: never) => void
			? K
			: never;
}[keyof O];

/** A type that takes every JSON value, such as a recursive JSON type, has no keys of its own. */
type AnyJson =
	| string
	| number
	| boolean
	| null
	| AnyJson[]
	| { [key: string]: AnyJson };

/**
 * Arrays use `T[]`, which TypeScript defers, and only tuples a mapped type,
 * which it doesn't: on a recursive union that would never end.
 */
type RenameNested<V, To extends KeyCase, Input extends boolean> = 0 extends 1 &
	V
	? V
	: AnyJson extends V
		? V
		: V extends readonly unknown[]
			? number extends V["length"]
				? V extends unknown[]
					? RenameNested<V[number], To, Input>[]
					: readonly RenameNested<V[number], To, Input>[]
				: { [I in keyof V]: RenameNested<V[I], To, Input> }
			: V extends object
				? [MethodOf<V>] extends [never]
					? {
							[K in keyof V as RenamedKey<K, To, Input>]: RenameNested<
								V[K],
								To,
								Input
							>;
						}
					: V
				: V;

/** A row or write object with its keys renamed, and with `Nested` those inside its values. */
type Rename<
	Row,
	To extends KeyCase,
	Nested extends boolean,
	Input extends boolean = false,
> = Row extends object
	? {
			[K in keyof Row as RenamedKey<K, To, Input>]: Nested extends true
				? RenameNested<Row[K], To, Input>
				: Row[K];
		}
	: Row;

/** Where keys inside values are renamed: in what is written, in rows, or in both. */
export type NestedCase = "input" | "output" | "all";

type Renames<
	Nested extends NestedCase | false,
	Way extends "input" | "output",
> = Nested extends Way | "all" ? true : false;

export interface CasePluginTypes<
	To extends KeyCase = "camelCase",
	Nested extends NestedCase | false = false,
> extends IdentityPluginTypes {
	readonly input: this["context"]["kind"] extends "set" | "values"
		? Rename<this["value"], To, Renames<Nested, "input">, true>
		: this["value"];
	readonly encoded: this["context"]["kind"] extends "set" | "values"
		? Rename<this["value"], Opposite<To>, Renames<Nested, "input">>
		: this["context"]["kind"] extends "value"
			? Renames<Nested, "input"> extends true
				? RenameNested<this["value"], Opposite<To>, false>
				: this["value"]
			: this["value"];
	readonly json: Renames<Nested, "input"> extends true
		? RenameNested<this["value"], Opposite<To>, false>
		: this["value"];
	readonly output: Rename<this["value"], To, Renames<Nested, "output">>;
}

export interface CasePluginOptions<
	To extends KeyCase = "camelCase",
	Nested extends NestedCase | false = false,
> {
	/**
	 * The case of the application's keys: `"camelCase"`, by default, for
	 * snake_case database names, or `"snake_case"` for camelCase ones.
	 */
	readonly to?: To;
	/**
	 * Also rename the keys inside values, such as JSON columns: `"output"` in
	 * rows, `"input"` in what is written, `"all"` in both. `false` by default.
	 */
	readonly nested?: Nested;
}

type Mapper = (key: string) => string;

/** Renames `value`'s keys. Only a write checks them: a row's later column wins, as documented. */
function renameKeys<V extends object>(
	value: V,
	map: Mapper,
	write: boolean,
	// biome-ignore lint/plugin: JSON has any shape; `CasePluginTypes` carries the precise types.
	item: (value: unknown) => unknown,
) {
	const sources = write ? new Map<string, string>() : undefined;
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => {
			const mapped = map(key);
			const source = sources?.get(mapped);
			if (source !== undefined)
				fail(
					`CasePlugin would write "${source}" and "${key}" as one key, "${mapped}", and lose a value`,
				);
			sources?.set(mapped, key);
			return [mapped, item(entry)];
		}),
	);
}

/**
 * Plain objects and arrays with every key renamed, as copies; anything else,
 * such as a `Date` or the `sql.optional()` omission, as is. fromEntries defines
 * each key, so `__proto__` stays a key.
 */
// biome-ignore lint/plugin: JSON has any shape; `CasePluginTypes` carries the precise types.
function mapNested<V>(value: V, map: Mapper, write: boolean): unknown {
	if (value === null || typeof value !== "object" || Object.is(value, empty))
		return value;
	if (Array.isArray(value))
		return value.map((item) => mapNested(item, map, write));
	const proto = Object.getPrototypeOf(value);
	return proto === null || Object.getPrototypeOf(proto) === null
		? renameKeys(value, map, write, (item) => mapNested(item, map, write))
		: value;
}

/** A copy of a plain object or class instance with its own enumerable keys renamed; anything else as is. */
function mapKeys<V>(value: V, map: Mapper, nested: boolean, write: boolean) {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		return value;
	return renameKeys(value, map, write, (item) =>
		nested ? mapNested(item, map, write) : item,
	);
}

/**
 * Renames application row and write keys one way and database write keys the
 * other: camelCase and snake_case, by default, or the reverse with
 * `to: "snake_case"`. JSON is untouched without `nested`.
 */
export class CasePlugin<
	To extends KeyCase = "camelCase",
	Nested extends NestedCase | false = false,
> implements SqlPlugin<CasePluginTypes<To, Nested>>
{
	declare readonly types?: CasePluginTypes<To, Nested>;
	readonly #toApplication: Mapper;
	readonly #toDatabase: Mapper;
	readonly #nestedInput: boolean;
	readonly #nestedOutput: boolean;

	constructor(options: CasePluginOptions<To, Nested> = {}) {
		const snake = options.to === "snake_case";
		this.#toApplication = snake ? snakeCase : camelCase;
		this.#toDatabase = snake ? camelCase : snakeCase;
		const nested = options.nested ?? false;
		if (
			nested !== false &&
			nested !== "input" &&
			nested !== "output" &&
			nested !== "all"
		)
			fail(
				`CasePlugin's nested option is "input", "output", "all" or false, not ${String(nested)}`,
			);
		this.#nestedInput = nested === "input" || nested === "all";
		this.#nestedOutput = nested === "output" || nested === "all";
	}
	// biome-ignore lint/plugin: implements the public `SqlPlugin.transformInput` signature.
	transformInput(value: unknown, context: InputContext): unknown {
		if (context.kind === "set" || context.kind === "values")
			return mapKeys(value, this.#toDatabase, this.#nestedInput, true);
		return context.kind === "value" ? this.transformJson(value) : value;
	}
	// biome-ignore lint/plugin: implements the public `SqlPlugin.transformJson` signature.
	transformJson(value: unknown): unknown {
		return this.#nestedInput ? mapNested(value, this.#toDatabase, true) : value;
	}
	// biome-ignore lint/plugin: implements the public `SqlPlugin.transformOutput` signature.
	transformOutput(row: unknown): unknown {
		return mapKeys(row, this.#toApplication, this.#nestedOutput, false);
	}
}
