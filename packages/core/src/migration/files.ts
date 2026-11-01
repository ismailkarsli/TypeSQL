import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import {
	createRequire,
	registerHooks,
	stripTypeScriptTypes,
} from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { formatSyntaxKind, Node } from "typescript/ast";
import type { API } from "typescript/sync";

/** A discovered TypeScript migration. Loading uses Node's native TypeScript support. */
export interface MigrationFile {
	readonly name: string;
	readonly path: string;
	readonly hash: string;
	load(): Promise<MigrationModule>;
}

export interface MigrationModule {
	readonly up: (context: never) => unknown;
	readonly down: (context: never) => unknown;
}

/**
 * Hash the erased JavaScript's syntax tree and original runtime token spellings.
 * Tree boundaries preserve automatic semicolon insertion (including return/newline)
 * while trivia and TypeScript-only declarations do not contribute to the hash.
 */
export function migrationHash(source: string): string {
	const javascript = stripTypeScriptTypes(source);
	const { API, formatSyntaxKind } = typescript();
	const api = new API();
	try {
		const lease = api.createSourceFile("migration.js", javascript);
		const file = lease.sourceFile;
		const hash = createHash("sha256");
		const visit = (node: Node): void => {
			if (formatSyntaxKind(node.kind).startsWith("JSDoc")) return;
			const children = node.getChildren(file);
			hash.update(`${formatSyntaxKind(node.kind)}[`);
			if (children.length === 0)
				hash.update(JSON.stringify(node.getText(file)));
			else for (const child of children) visit(child);
			hash.update("]");
		};
		visit(file);
		return hash.digest("hex");
	} finally {
		api.close();
	}
}

let loaded:
	| { API: typeof API; formatSyntaxKind: typeof formatSyntaxKind }
	| undefined;

/** TypeScript's parser hashes migrations; load it only when a migration is read. */
function typescript(): NonNullable<typeof loaded> {
	if (loaded) return loaded;
	const require = createRequire(import.meta.url);
	try {
		loaded = {
			API: require("typescript/sync").API,
			formatSyntaxKind: require("typescript/ast").formatSyntaxKind,
		};
	} catch (cause) {
		throw new Error(
			"typesql: migrations need the typescript package (7.1 or later) at runtime; install it as a dependency",
			{ cause },
		);
	}
	return loaded;
}

/** File URLs of the migration directories whose imports are mapped. */
const directories = new Set<string>();

/**
 * Migrations import each other as `./name.js`, which TypeScript resolves to
 * `./name.ts`. Node doesn't, so a relative `.js` import that a migration
 * makes and that doesn't exist loads the `.ts` file beside it instead.
 */
function mapMigrationImports(directory: string): void {
	if (directories.size === 0)
		registerHooks({
			resolve(specifier, context, nextResolve) {
				try {
					return nextResolve(specifier, context);
				} catch (error) {
					const parent = context.parentURL;
					if (
						(error as { code?: unknown }).code !== "ERR_MODULE_NOT_FOUND" ||
						!/^\.\.?\/.*\.js$/.test(specifier) ||
						parent === undefined ||
						!directories.has(new URL(".", parent).href)
					)
						throw error;
					return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
				}
			},
		});
	directories.add(pathToFileURL(`${directory}/`).href);
}

export async function discoverMigrations(
	migrationsDir: string,
): Promise<readonly MigrationFile[]> {
	const directory = resolve(migrationsDir);
	mapMigrationImports(directory);
	const entries = await readdir(directory, { withFileTypes: true });
	const names = entries
		.filter(
			(entry) =>
				(entry.isFile() || entry.isSymbolicLink()) &&
				entry.name.endsWith(".ts"),
		)
		.map((entry) => entry.name)
		.sort();
	return Promise.all(
		names.map(async (name): Promise<MigrationFile> => {
			const path = resolve(directory, name);
			const source = await readFile(path, "utf8");
			const hash = migrationHash(source);
			return {
				name,
				path,
				hash,
				async load() {
					if (migrationHash(await readFile(path, "utf8")) !== hash)
						throw new Error(`Migration changed during execution: ${name}`);
					const url = pathToFileURL(path);
					url.searchParams.set("typesql", hash);
					let module: unknown;
					try {
						module = await import(url.href);
					} catch (error) {
						// migration() is imported at runtime, so with pnpm a project
						// that only depends on @typesql/cli can't load its migrations.
						if (
							(error as { code?: unknown }).code === "ERR_MODULE_NOT_FOUND" &&
							String(error).includes("'@typesql/core'")
						)
							throw new Error(
								`${String((error as Error).message)}; add @typesql/core to the project's dependencies (npm install @typesql/core, or pnpm add @typesql/core)`,
								{ cause: error },
							);
						throw error;
					}
					if (
						module === null ||
						typeof module !== "object" ||
						!("up" in module) ||
						typeof module.up !== "function" ||
						!("down" in module) ||
						typeof module.down !== "function"
					)
						throw new Error(
							`Migration must export up and down functions: ${name}`,
						);
					return module as MigrationModule;
				},
			};
		}),
	);
}
