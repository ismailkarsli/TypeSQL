// What the connections of the migrator and `typesql introspect` share; each
// dialect's driver module opens its own. Drivers load at runtime from
// node_modules, and Node's built-ins through process.getBuiltinModule(),
// which bundlers don't follow as they follow an import: a Worker bundle has
// nothing of them to resolve.

import type { Executor } from "./query.js";

/** A connection: `client` is the driver's own, for code that reads it directly. */
export interface Connection<Client> {
	readonly client: Client;
	readonly execute: Executor;
	close(): Promise<void>;
}

/**
 * A package, imported at runtime from node_modules. Bundlers follow a
 * literal import() and would bundle it, but a Worker bundle can't resolve
 * `pg`'s Node built-ins. `is` checks the module is the one expected.
 */
export async function runtimeImport<Module>(
	specifier: string,
	is: (module: unknown) => module is Module,
): Promise<Module> {
	const module: unknown = await import(
		/* webpackIgnore: true */ /* @vite-ignore */ specifier
	);
	if (!is(module))
		throw new Error(`typesql: ${specifier} is not the expected package`);
	return module;
}

/** What a session's 'error' event ends: the error the next statement rejects with. */
export interface Lost {
	error: Error | undefined;
}

/** Ending a session the server already ended fails; that is not an error. */
export async function closing(end: Promise<void>, lost: Lost): Promise<void> {
	await end.catch((cause: unknown) => {
		if (!lost.error) throw cause;
	});
}
