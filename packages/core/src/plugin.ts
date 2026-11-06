/** The boundary at which an application value is converted to database input. */
export type InputContext =
	/** `table` is `null` for `sql.set(values)` and `sql.values(rows)`. */
	| { readonly kind: "set" | "values"; readonly table: string | null }
	| { readonly kind: "parameters"; readonly query: string }
	| { readonly kind: "value" };

/** Type functions implemented by a plugin using `this["value"]`. */
export interface PluginTypes {
	readonly value: unknown;
	readonly context: InputContext;
	/** Database input type to the input accepted from the application. */
	readonly input: unknown;
	/** Application input to the actual value sent to the database. */
	readonly encoded: unknown;
	/** Database row to the row returned to the application. */
	readonly output: unknown;
	/** The value of `sql.json()` to the JSON sent; that value unchanged when left out. */
	readonly json?: unknown;
}

/** Extend this interface when only some of the type functions need to change. */
export interface IdentityPluginTypes extends PluginTypes {
	readonly input: this["value"];
	readonly encoded: this["value"];
	readonly output: this["value"];
}

export interface SqlPlugin<T extends PluginTypes = PluginTypes> {
	/** Type-only witness; plugins do not need to create this property at runtime. */
	readonly types?: T;
	// biome-ignore lint/plugin: plugins receive any query parameter; `types` carries the precise types.
	transformInput?(value: unknown, context: InputContext): unknown;
	// biome-ignore lint/plugin: plugins receive any result row; `types` carries the precise types.
	transformOutput?(row: unknown): unknown;
	/** Converts the value of `sql.json()`, other than `null` and `undefined`, which send no JSON. */
	// biome-ignore lint/plugin: plugins receive any JSON value; `types` carries the precise types.
	transformJson?(value: unknown): unknown;
}

type Apply<
	P extends SqlPlugin,
	V,
	C extends InputContext,
	K extends "input" | "encoded" | "output",
> =
	P extends SqlPlugin<infer T>
		? (T & { readonly value: V; readonly context: C })[K]
		: V;

export type PluginInput<
	V,
	P extends readonly SqlPlugin[],
	C extends InputContext,
> = P extends readonly [
	infer H extends SqlPlugin,
	...infer R extends readonly SqlPlugin[],
]
	? PluginInput<Apply<H, V, C, "input">, R, C>
	: V;

export type PluginEncoded<
	V,
	P extends readonly SqlPlugin[],
	C extends InputContext,
> = P extends readonly [
	...infer R extends readonly SqlPlugin[],
	infer H extends SqlPlugin,
]
	? PluginEncoded<Apply<H, V, C, "encoded">, R, C>
	: V;

export type PluginOutput<
	V,
	P extends readonly SqlPlugin[],
> = P extends readonly [
	infer H extends SqlPlugin,
	...infer R extends readonly SqlPlugin[],
]
	? PluginOutput<Apply<H, V, InputContext, "output">, R>
	: V;

type ApplyJson<P extends SqlPlugin, V> =
	P extends SqlPlugin<infer T>
		? (T & { readonly value: V })["json"] extends infer J
			? unknown extends J
				? V
				: J
			: never
		: V;

export type PluginJson<V, P extends readonly SqlPlugin[]> = P extends readonly [
	...infer R extends readonly SqlPlugin[],
	infer H extends SqlPlugin,
]
	? PluginJson<ApplyJson<H, V>, R>
	: V;

export const encodeInput = <V>(
	value: V,
	plugins: readonly SqlPlugin[],
	context: InputContext,
	// biome-ignore lint/plugin: returns whatever the plugins' `transformInput` returns.
): unknown =>
	plugins.reduceRight<unknown>(
		(encoded, plugin) => plugin.transformInput?.(encoded, context) ?? encoded,
		value,
	);

export const encodeJson = <V>(
	value: V,
	plugins: readonly SqlPlugin[],
	// biome-ignore lint/plugin: returns whatever the plugins' `transformJson` returns.
): unknown =>
	value === null || value === undefined
		? value
		: plugins.reduceRight<unknown>(
				(encoded, plugin) => plugin.transformJson?.(encoded) ?? encoded,
				value,
			);

export const applyPlugins = (
	rows: readonly unknown[],
	plugins: readonly SqlPlugin[],
): unknown[] =>
	rows.map((row) =>
		plugins.reduce(
			(r, plugin) => (plugin.transformOutput ? plugin.transformOutput(r) : r),
			row,
		),
	);
