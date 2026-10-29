import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { formatSyntaxKind, type Node } from "typescript/ast";
import { API } from "typescript/sync";

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

export async function discoverMigrations(
	migrationsDir: string,
): Promise<readonly MigrationFile[]> {
	const directory = resolve(migrationsDir);
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
					const module: unknown = await import(url.href);
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
