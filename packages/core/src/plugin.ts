/** The boundary at which an application value is converted to database input. */
export type InputContext =
	| { readonly kind: "set" | "values"; readonly table: string }
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
	transformInput?(value: unknown, context: InputContext): unknown;
	transformOutput?(row: unknown): unknown;
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

export function encodeInput(
	value: unknown,
	plugins: readonly SqlPlugin[],
	context: InputContext,
): unknown {
	for (let i = plugins.length - 1; i >= 0; i--) {
		const plugin = plugins[i]!;
		if (plugin.transformInput) value = plugin.transformInput(value, context);
	}
	return value;
}

export function encodeParameters(
	args: readonly unknown[],
	plugins: readonly SqlPlugin[],
	query: string,
): readonly unknown[] {
	const encoded = encodeInput(args, plugins, { kind: "parameters", query });
	if (!Array.isArray(encoded))
		throw new Error(
			"typesql: a plugin must encode query parameters as an array",
		);
	return encoded;
}

export function applyPlugins(
	rows: readonly unknown[],
	plugins: readonly SqlPlugin[],
): unknown[] {
	if (plugins.length === 0) return Array.from(rows);
	return rows.map((row) => {
		for (const plugin of plugins)
			if (plugin.transformOutput) row = plugin.transformOutput(row);
		return row;
	});
}
