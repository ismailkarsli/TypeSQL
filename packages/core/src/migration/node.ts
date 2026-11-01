// The migrator's Node-only modules reach Node's built-ins through
// process.getBuiltinModule(), which bundlers don't follow as they follow an
// import: the modules can be bundled for Node, where it works at runtime, and
// for Workers, which have the modules but never call them.

/**
 * A package, imported at runtime from node_modules. Bundlers follow a
 * literal import() and would bundle it, but a Worker bundle can't resolve
 * `pg`'s Node built-ins.
 */
export const runtimeImport = (specifier: string): Promise<unknown> =>
	import(/* webpackIgnore: true */ /* @vite-ignore */ specifier);
